import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { ZodError, z } from "zod";

import { DATE_RE } from "@/lib/dates";
import { parseDuration } from "@/lib/duration";

import { appRouter } from "../routers/_app";
import { createCallerFactory } from "../trpc";

/**
 * The tools the MCP server offers. Every tool calls the same tRPC procedures the website uses,
 * as the token's owner, so business rules (ownership checks, duplicate names, invoice math) live
 * in one place and a token can never reach another account's data.
 *
 * Conventions for the model that reads these descriptions:
 * - Dates are the user's local calendar dates (YYYY-MM-DD). The server runs in UTC and cannot know
 *   the user's "today", so write tools always take the date explicitly.
 * - Time is whole minutes. Money arrives and leaves in dollars (stored as cents).
 * - Projects can be named as "Client / Project" instead of by id.
 */

const makeCaller = createCallerFactory(appRouter);
export type Caller = ReturnType<typeof makeCaller>;

export function callerFor(prisma: PrismaClient, userId: string): Caller {
  return makeCaller({ session: { user: { id: userId }, expires: "" }, prisma });
}

export type ToolContext = { prisma: PrismaClient; userId: string; access: "read" | "write" };

export type McpTool = {
  name: string;
  title: string;
  description: string;
  /** "write" tools are refused for read-only tokens. */
  access: "read" | "write";
  destructive?: boolean;
  idempotent?: boolean;
  input: z.ZodType;
  run: (c: Caller, args: never, x: ToolContext) => Promise<unknown>;
};

function defineTool<S extends z.ZodType>(t: {
  name: string;
  title: string;
  description: string;
  access: "read" | "write";
  destructive?: boolean;
  idempotent?: boolean;
  input: S;
  run: (c: Caller, args: z.infer<S>, x: ToolContext) => Promise<unknown>;
}): McpTool {
  return t as unknown as McpTool;
}

// ---------------------------------------------------------------- shared input pieces

const date = z.string().regex(DATE_RE, "Use YYYY-MM-DD").describe("Local calendar date, YYYY-MM-DD");
const projectRef = z
  .string()
  .trim()
  .min(1)
  .describe('Project id, or "Client / Project" (just the project name works when it is unique)');
const clientRef = z.string().trim().min(1).describe("Client id or exact client name");
const noteText = z.string().trim().max(2000).describe("Description of the work (max 2,000 characters)");
const minutesInt = z.number().int().min(1).max(1440).describe("Whole minutes, 1 to 1440");
const durationText = z
  .string()
  .trim()
  .describe(
    'Free-form duration: "1.5", "1:30", "90m", "2h", "1h30". A bare number up to 12 means hours, larger means minutes',
  );
const dollars = z.number().min(0).max(10_000).describe("Dollars per hour, e.g. 85 or 62.5");

// ---------------------------------------------------------------- helpers

const round2 = (n: number) => Math.round(n * 100) / 100;
const hours = (minutes: number) => round2(minutes / 60);
const toCents = (d: number) => Math.round(d * 100);

type FlatProject = {
  id: string;
  name: string;
  client_id: string;
  client: string;
  label: string;
  hourly_rate: number;
  hourly_rate_cents: number;
  billable: boolean;
};

async function listProjects(c: Caller): Promise<FlatProject[]> {
  const clients = await c.clients.list();
  return clients.flatMap((cl) =>
    cl.projects.map((p) => ({
      id: p.id,
      name: p.name,
      client_id: cl.id,
      client: cl.name,
      label: `${cl.name} / ${p.name}`,
      hourly_rate: round2(p.hourly_rate / 100),
      hourly_rate_cents: p.hourly_rate,
      billable: p.billable,
    })),
  );
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function pickProject(list: FlatProject[], ref: string, what = "project"): FlatProject {
  const byId = list.find((p) => p.id === ref);
  if (byId) return byId;
  const q = norm(ref.replace(/\s*[/>:|]\s*/g, " / "));
  const exact = list.filter((p) => norm(p.label) === q);
  if (exact.length === 1) return exact[0];
  const named = list.filter((p) => norm(p.name) === q);
  if (named.length === 1) return named[0];
  const loose = list.filter((p) => norm(p.label).includes(q));
  if (loose.length === 1) return loose[0];
  const candidates = exact.length > 1 ? exact : named.length > 1 ? named : loose;
  if (candidates.length > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `"${ref}" matches more than one ${what}: ${candidates
        .slice(0, 8)
        .map((p) => `"${p.label}"`)
        .join(", ")}. Use the full "Client / Project" name or the id.`,
    });
  }
  throw new TRPCError({
    code: "NOT_FOUND",
    message: `No ${what} matches "${ref}". Available: ${
      list
        .slice(0, 15)
        .map((p) => `"${p.label}"`)
        .join(", ") || "none yet (create a client and project first)"
    }.`,
  });
}

async function resolveProject(c: Caller, ref: string): Promise<FlatProject> {
  return pickProject(await listProjects(c), ref);
}

async function resolveClient(c: Caller, ref: string) {
  const clients = await c.clients.list();
  const found = clients.find((x) => x.id === ref) ?? clients.find((x) => norm(x.name) === norm(ref));
  if (!found) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `No client matches "${ref}". Clients: ${clients.map((x) => `"${x.name}"`).join(", ") || "none yet"}.`,
    });
  }
  return found;
}

type EntryRow = {
  id: string;
  date: string;
  minutes: number;
  note: string;
  started_at: Date | null;
  project: { id: string; name: string; client: { id: string; name: string } };
};

function shapeEntry(e: EntryRow) {
  return {
    id: e.id,
    date: e.date,
    minutes: e.minutes,
    hours: hours(e.minutes),
    note: e.note,
    running: Boolean(e.started_at),
    started_at: e.started_at ? e.started_at.toISOString() : null,
    project: { id: e.project.id, name: e.project.name },
    client: { id: e.project.client.id, name: e.project.client.name },
  };
}

function summarize(entries: EntryRow[]) {
  const total = entries.reduce((n, e) => n + e.minutes, 0);
  const byProject = new Map<string, { project: string; client: string; minutes: number }>();
  const byDate = new Map<string, number>();
  for (const e of entries) {
    const k = e.project.id;
    const cur = byProject.get(k) ?? { project: e.project.name, client: e.project.client.name, minutes: 0 };
    cur.minutes += e.minutes;
    byProject.set(k, cur);
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.minutes);
  }
  return {
    total_minutes: total,
    total_hours: hours(total),
    by_project: [...byProject.values()]
      .sort((a, b) => b.minutes - a.minutes)
      .map((p) => ({ ...p, hours: hours(p.minutes) })),
    by_date: [...byDate.entries()].sort().map(([d, m]) => ({ date: d, minutes: m, hours: hours(m) })),
  };
}

function minutesFromArgs(a: { minutes?: number; duration?: string }): number | undefined {
  if (a.minutes !== undefined) return a.minutes;
  if (a.duration === undefined) return undefined;
  const m = parseDuration(a.duration);
  if (!m || m < 1 || m > 1440) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Couldn't read that duration. Try 1.5, 1:30 or 90m." });
  }
  return m;
}

const needsDuration = (v: { minutes?: number; duration?: string }) =>
  v.minutes !== undefined || v.duration !== undefined;

// A snapshot carries the seller's and client's logos (hundreds of KB each); the model never needs them.
function stripLogos<T extends { seller?: { logo?: unknown }; client?: { logo?: unknown } }>(snapshot: T): T {
  const copy = JSON.parse(JSON.stringify(snapshot)) as T;
  if (copy.seller && "logo" in copy.seller) copy.seller.logo = copy.seller.logo ? "[logo]" : null;
  if (copy.client && "logo" in copy.client) copy.client.logo = copy.client.logo ? "[logo]" : null;
  return copy;
}

function shapeInvoiceSummary(i: {
  id: string;
  client_name: string;
  number: string;
  issue_date: string;
  due_date: string | null;
  paid_date: string | null;
  period_from: string;
  period_to: string;
  total_minutes: number;
  total_cents: number;
  notes: string;
}) {
  return {
    id: i.id,
    number: i.number,
    client: i.client_name,
    issue_date: i.issue_date,
    due_date: i.due_date,
    paid_date: i.paid_date,
    status: i.paid_date ? "paid" : "unpaid",
    period_from: i.period_from,
    period_to: i.period_to,
    hours: hours(i.total_minutes),
    total: round2(i.total_cents / 100),
    total_cents: i.total_cents,
    notes: i.notes,
  };
}

async function findInvoiceId(c: Caller, ref: string): Promise<string> {
  // Ids are uuids; anything else is treated as an invoice number such as INV-2026-004.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return ref;
  const rows = await c.invoice.list({ q: ref });
  const hit = rows.find((r) => r.number.toLowerCase() === ref.toLowerCase());
  if (!hit) throw new TRPCError({ code: "NOT_FOUND", message: `No invoice numbered "${ref}".` });
  return hit.id;
}

const invoiceRef = z.string().trim().min(1).describe("Invoice id or invoice number, e.g. INV-2026-004");

// ---------------------------------------------------------------- the tools

export const TOOLS: McpTool[] = [
  // ---- reading
  defineTool({
    name: "whoami",
    title: "Who am I",
    description:
      "The signed-in account (name, email, business details printed on invoices) and what this token may do (read or write). Call this first to confirm the connection.",
    access: "read",
    idempotent: true,
    input: z.object({}),
    run: async (c, _a, x) => {
      const me = await c.account.me();
      return {
        id: me.id,
        name: me.name,
        email: me.email,
        member_since: me.created_at,
        token_access: x.access,
        business: {
          name: me.business_name,
          ein: me.ein,
          address: me.address,
          payment_instructions: me.payment_instructions,
          has_logo: Boolean(me.logo),
        },
      };
    },
  }),

  defineTool({
    name: "list_projects",
    title: "List projects",
    description:
      'Every active project with its client and hourly rate. Use the "label" ("Client / Project") or the id wherever a project is asked for. Set include_archived to also see archived ones.',
    access: "read",
    idempotent: true,
    input: z.object({ include_archived: z.boolean().default(false) }),
    run: async (c, a) => {
      const active = await listProjects(c);
      if (!a.include_archived) return { projects: active };
      const archived = (await c.project.listArchived()).map((p) => ({
        id: p.id,
        name: p.name,
        client_id: p.client.id,
        client: p.client.name,
        label: `${p.client.name} / ${p.name}`,
        hourly_rate: round2(p.hourly_rate / 100),
        hourly_rate_cents: p.hourly_rate,
        billable: p.billable,
        archived: true,
      }));
      return { projects: active, archived };
    },
  }),

  defineTool({
    name: "list_clients",
    title: "List clients",
    description: "Active clients, each with its active projects.",
    access: "read",
    idempotent: true,
    input: z.object({}),
    run: async (c) => {
      const clients = await c.clients.list();
      return {
        clients: clients.map((cl) => ({
          id: cl.id,
          name: cl.name,
          color: cl.color,
          legal_name: cl.legal_name,
          address: cl.address,
          projects: cl.projects.map((p) => ({
            id: p.id,
            name: p.name,
            hourly_rate: round2(p.hourly_rate / 100),
            billable: p.billable,
          })),
        })),
      };
    },
  }),

  defineTool({
    name: "get_client",
    title: "Get client billing details",
    description: "One client's billing details: full legal name and address as printed on invoices.",
    access: "read",
    idempotent: true,
    input: z.object({ client: clientRef }),
    run: async (c, a) => {
      const cl = await resolveClient(c, a.client);
      const full = await c.clients.get({ id: cl.id });
      return {
        id: full.id,
        name: full.name,
        legal_name: full.legal_name,
        address: full.address,
        has_logo: Boolean(full.logo),
      };
    },
  }),

  defineTool({
    name: "list_entries",
    title: "List time entries",
    description:
      "Time entries between two dates (inclusive), newest first, with totals per project and per day. Optionally limited to one project. Use this for 'what did I log last week' and to check a day before adding time.",
    access: "read",
    idempotent: true,
    input: z
      .object({ from: date, to: date, project: projectRef.optional() })
      .refine((v) => v.from <= v.to, { message: "from must be on or before to." }),
    run: async (c, a) => {
      let rows = (await c.entry.list({ from: a.from, to: a.to })) as EntryRow[];
      if (a.project) {
        const p = await resolveProject(c, a.project);
        rows = rows.filter((r) => r.project.id === p.id);
      }
      const LIMIT = 500;
      return {
        from: a.from,
        to: a.to,
        summary: summarize(rows),
        entries: rows.slice(0, LIMIT).map(shapeEntry),
        truncated: rows.length > LIMIT,
      };
    },
  }),

  defineTool({
    name: "project_totals",
    title: "Hours per project",
    description: "Logged hours per project: all time and within a date range (for example this month).",
    access: "read",
    idempotent: true,
    input: z.object({ from: date, to: date }),
    run: async (c, a) => {
      const [totals, projects] = await Promise.all([c.project.totals(a), listProjects(c)]);
      return {
        from: a.from,
        to: a.to,
        projects: projects
          .map((p) => ({
            project: p.label,
            id: p.id,
            hours_in_range: hours(totals[p.id]?.range ?? 0),
            hours_all_time: hours(totals[p.id]?.total ?? 0),
          }))
          .sort((x, y) => y.hours_in_range - x.hours_in_range),
      };
    },
  }),

  defineTool({
    name: "get_running_timer",
    title: "Running timer",
    description: "The timer that is running now, with elapsed minutes, or null when none is running.",
    access: "read",
    idempotent: true,
    input: z.object({}),
    run: async (c) => {
      const t = (await c.entry.running()) as EntryRow | null;
      if (!t?.started_at) return { running: null };
      const elapsed = Math.max(1, Math.ceil((Date.now() - t.started_at.getTime()) / 60_000));
      return { running: { ...shapeEntry(t), elapsed_minutes: t.minutes + elapsed } };
    },
  }),

  defineTool({
    name: "annual_report",
    title: "Year summary for taxes",
    description:
      "One calendar year: hours and earnings by quarter, month, client and project, plus invoices issued and paid (cash and accrual views).",
    access: "read",
    idempotent: true,
    input: z.object({ year: z.number().int().min(2000).max(2100) }),
    run: (c, a) => c.report.annual(a),
  }),

  defineTool({
    name: "list_invoices",
    title: "List invoices",
    description: "Invoice history (newest 200 at most). Filter by text, client, paid status or issue-date range.",
    access: "read",
    idempotent: true,
    input: z.object({
      query: z
        .string()
        .trim()
        .max(100)
        .optional()
        .describe("Matches number, client, notes, project names and entry notes"),
      client: clientRef.optional(),
      status: z.enum(["all", "unpaid", "paid"]).default("all"),
      issued_from: date.optional(),
      issued_to: date.optional(),
      sort: z.enum(["newest", "oldest", "highest", "lowest"]).default("newest"),
    }),
    run: async (c, a) => {
      const clientId = a.client ? (await resolveClient(c, a.client)).id : undefined;
      const rows = await c.invoice.list({
        q: a.query,
        clientId,
        status: a.status,
        from: a.issued_from,
        to: a.issued_to,
        sort: a.sort,
      });
      const unpaid = rows.filter((r) => !r.paid_date);
      return {
        count: rows.length,
        unpaid_total: round2(unpaid.reduce((n, r) => n + r.total_cents, 0) / 100),
        invoices: rows.map(shapeInvoiceSummary),
      };
    },
  }),

  defineTool({
    name: "get_invoice",
    title: "Get an invoice",
    description:
      "The frozen invoice as issued: seller, client, lines per project and totals. Set include_detail for the per-entry breakdown. Logos are left out.",
    access: "read",
    idempotent: true,
    input: z.object({ invoice: invoiceRef, include_detail: z.boolean().default(false) }),
    run: async (c, a) => {
      const id = await findInvoiceId(c, a.invoice);
      const { snapshot } = await c.invoice.get({ id });
      const clean = stripLogos(snapshot) as Omit<typeof snapshot, "detail"> & { detail?: unknown };
      if (!a.include_detail) delete clean.detail;
      return { id, snapshot: clean };
    },
  }),

  defineTool({
    name: "next_invoice_number",
    title: "Next invoice number",
    description: "The suggested next invoice number for a year, such as INV-2026-004.",
    access: "read",
    idempotent: true,
    input: z.object({ year: z.number().int().min(2000).max(2100) }),
    run: (c, a) => c.invoice.nextNumber(a),
  }),

  defineTool({
    name: "parse_duration",
    title: "Parse a duration",
    description: 'Turn text like "1h30", "1:30" or "2.5" into whole minutes, the way UseHourly reads it.',
    access: "read",
    idempotent: true,
    input: z.object({ text: durationText }),
    run: async (_c, a) => {
      const m = parseDuration(a.text);
      return m ? { minutes: m, hours: hours(m) } : { minutes: null, error: "Couldn't read that duration." };
    },
  }),

  // ---- logging time
  defineTool({
    name: "log_time",
    title: "Log time",
    description:
      "Add one time entry: a project, a date, how long, and what was done. Give minutes or a duration text. This adds a new entry; it never merges with an existing one. Check list_entries first if the day may already be logged.",
    access: "write",
    input: z
      .object({
        project: projectRef,
        date,
        minutes: minutesInt.optional(),
        duration: durationText.optional(),
        note: noteText.default(""),
      })
      .refine(needsDuration, { message: "Give minutes or a duration." }),
    run: async (c, a) => {
      const p = await resolveProject(c, a.project);
      const created = (await c.entry.create({
        projectId: p.id,
        date: a.date,
        minutes: a.minutes,
        duration: a.duration,
        note: a.note,
      })) as EntryRow;
      return { logged: shapeEntry(created) };
    },
  }),

  defineTool({
    name: "log_time_on_days",
    title: "Log the same time on several days",
    description:
      "Add the same entry (project, minutes, note) on up to 31 dates. Days that already have time for this project are skipped and reported unless skip_existing is false.",
    access: "write",
    input: z
      .object({
        project: projectRef,
        dates: z.array(date).min(1).max(31),
        minutes: minutesInt.optional(),
        duration: durationText.optional(),
        note: noteText.default(""),
        skip_existing: z.boolean().default(true),
      })
      .refine(needsDuration, { message: "Give minutes or a duration." }),
    run: async (c, a) => {
      const p = await resolveProject(c, a.project);
      const minutes = minutesFromArgs(a) as number;
      const r = await c.entry.createMany({
        projectId: p.id,
        dates: a.dates,
        minutes,
        note: a.note,
        skipExisting: a.skip_existing,
      });
      return { project: p.label, minutes, ...r };
    },
  }),

  defineTool({
    name: "set_day_totals",
    title: "Set a project's total for days",
    description:
      "Set one project's total minutes for up to 31 days: more than 0 creates or updates that day's single entry, 0 clears it. Days that hold several entries or a running timer are skipped and reported, never merged. A note, when given, is applied to every day written.",
    access: "write",
    idempotent: true,
    input: z.object({
      project: projectRef,
      cells: z
        .array(z.object({ date, minutes: z.number().int().min(0).max(1440) }))
        .min(1)
        .max(31),
      note: noteText.optional(),
    }),
    run: async (c, a) => {
      const p = await resolveProject(c, a.project);
      const r = await c.entry.bulkSet({ projectId: p.id, cells: a.cells, note: a.note });
      return { project: p.label, ...r };
    },
  }),

  defineTool({
    name: "update_entry",
    title: "Edit an entry",
    description: "Change an entry's project, date, minutes or note. Only the fields you pass change.",
    access: "write",
    idempotent: true,
    input: z
      .object({
        id: z.string().min(1),
        project: projectRef.optional(),
        date: date.optional(),
        minutes: minutesInt.optional(),
        duration: durationText.optional(),
        note: noteText.optional(),
      })
      .refine((v) => [v.project, v.date, v.minutes, v.duration, v.note].some((x) => x !== undefined), {
        message: "Pass at least one field to change.",
      }),
    run: async (c, a) => {
      const projectId = a.project ? (await resolveProject(c, a.project)).id : undefined;
      const updated = (await c.entry.update({
        id: a.id,
        projectId,
        date: a.date,
        minutes: minutesFromArgs(a),
        note: a.note,
      })) as EntryRow;
      return { updated: shapeEntry(updated) };
    },
  }),

  defineTool({
    name: "merge_entries",
    title: "Merge entries",
    description:
      "Fold several entries (same project, same day) into the first one: minutes are added and notes joined. The others are removed.",
    access: "write",
    destructive: true,
    input: z.object({ ids: z.array(z.string().min(1)).min(2).max(20) }),
    run: (c, a) => c.entry.merge(a),
  }),

  defineTool({
    name: "delete_entry",
    title: "Delete an entry",
    description: "Permanently delete one time entry. Confirm with the user before calling this.",
    access: "write",
    destructive: true,
    input: z.object({ id: z.string().min(1) }),
    run: (c, a) => c.entry.delete(a),
  }),

  // ---- timer
  defineTool({
    name: "start_timer",
    title: "Start the timer",
    description:
      "Start a timer on a project. A timer that is already running is stopped first, so only one runs at a time.",
    access: "write",
    input: z.object({ project: projectRef, date, note: noteText.default("") }),
    run: async (c, a) => {
      const p = await resolveProject(c, a.project);
      const t = (await c.entry.start({ projectId: p.id, date: a.date, note: a.note })) as EntryRow;
      return { started: shapeEntry(t) };
    },
  }),

  defineTool({
    name: "stop_timer",
    title: "Stop the timer",
    description: "Stop the running timer. Elapsed time is rounded up to the next minute (at least 1).",
    access: "write",
    input: z.object({}),
    run: async (c) => ({ stopped: shapeEntry((await c.entry.stop()) as EntryRow) }),
  }),

  // ---- clients and projects
  defineTool({
    name: "create_client",
    title: "Create a client",
    description: "Add a client. Names are unique per account.",
    access: "write",
    input: z.object({
      name: z.string().trim().min(1).max(80),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional()
        .describe("Hex colour such as #6366f1"),
    }),
    run: async (c, a) => {
      const cl = await c.clients.create(a);
      return { client: { id: cl.id, name: cl.name, color: cl.color } };
    },
  }),

  defineTool({
    name: "update_client",
    title: "Edit a client",
    description:
      "Rename a client or change the legal name and address printed on its invoices. Only the fields you pass change; the logo is kept.",
    access: "write",
    idempotent: true,
    input: z
      .object({
        client: clientRef,
        name: z.string().trim().min(1).max(80).optional(),
        legal_name: z.string().trim().max(150).optional().describe("Empty string clears it"),
        address: z.string().trim().max(300).optional().describe("Empty string clears it"),
      })
      .refine((v) => [v.name, v.legal_name, v.address].some((x) => x !== undefined), {
        message: "Pass at least one field to change.",
      }),
    run: async (c, a) => {
      const cl = await resolveClient(c, a.client);
      const current = await c.clients.get({ id: cl.id });
      await c.clients.update({
        id: cl.id,
        name: a.name ?? current.name,
        legalName: a.legal_name ?? current.legal_name ?? "",
        address: a.address ?? current.address ?? "",
        logo: current.logo,
      });
      return { ok: true, client: a.name ?? current.name };
    },
  }),

  defineTool({
    name: "archive_client",
    title: "Archive a client",
    description: "Hide a client from the lists. Its time and invoices are kept.",
    access: "write",
    idempotent: true,
    input: z.object({ client: clientRef }),
    run: async (c, a) => {
      const cl = await resolveClient(c, a.client);
      await c.clients.archive({ id: cl.id });
      return { ok: true, archived: cl.name };
    },
  }),

  defineTool({
    name: "create_project",
    title: "Create a project",
    description: "Add a project under a client, with an hourly rate in dollars and whether it is billable.",
    access: "write",
    input: z.object({
      client: clientRef,
      name: z.string().trim().min(1).max(80),
      hourly_rate: dollars.default(0),
      billable: z.boolean().default(true),
    }),
    run: async (c, a) => {
      const cl = await resolveClient(c, a.client);
      const p = await c.project.create({
        clientId: cl.id,
        name: a.name,
        hourlyRate: toCents(a.hourly_rate),
        billable: a.billable,
      });
      return {
        project: {
          id: p.id,
          label: `${cl.name} / ${p.name}`,
          hourly_rate: round2(p.hourly_rate / 100),
          billable: p.billable,
        },
      };
    },
  }),

  defineTool({
    name: "update_project",
    title: "Edit a project",
    description:
      "Rename a project, move it to another client, or change its rate or billable flag. Only the fields you pass change.",
    access: "write",
    idempotent: true,
    input: z
      .object({
        project: projectRef,
        name: z.string().trim().min(1).max(80).optional(),
        client: clientRef.optional().describe("Move the project to this client"),
        hourly_rate: dollars.optional(),
        billable: z.boolean().optional(),
      })
      .refine((v) => [v.name, v.client, v.hourly_rate, v.billable].some((x) => x !== undefined), {
        message: "Pass at least one field to change.",
      }),
    run: async (c, a) => {
      const p = await resolveProject(c, a.project);
      const clientId = a.client ? (await resolveClient(c, a.client)).id : undefined;
      const updated = await c.project.update({
        id: p.id,
        name: a.name,
        clientId,
        hourlyRate: a.hourly_rate === undefined ? undefined : toCents(a.hourly_rate),
        billable: a.billable,
      });
      return {
        project: {
          id: updated.id,
          name: updated.name,
          hourly_rate: round2(updated.hourly_rate / 100),
          billable: updated.billable,
        },
      };
    },
  }),

  defineTool({
    name: "archive_project",
    title: "Archive a project",
    description: "Hide a project from the lists. Its time and invoices are kept.",
    access: "write",
    idempotent: true,
    input: z.object({ project: projectRef }),
    run: async (c, a) => {
      const p = await resolveProject(c, a.project);
      await c.project.archive({ id: p.id });
      return { ok: true, archived: p.label };
    },
  }),

  defineTool({
    name: "unarchive_project",
    title: "Restore a project",
    description: "Bring an archived project (and its client, if archived) back.",
    access: "write",
    idempotent: true,
    input: z.object({ project: projectRef.describe('Archived project id or "Client / Project"') }),
    run: async (c, a) => {
      const archived = (await c.project.listArchived()).map(
        (p): FlatProject => ({
          id: p.id,
          name: p.name,
          client_id: p.client.id,
          client: p.client.name,
          label: `${p.client.name} / ${p.name}`,
          hourly_rate: round2(p.hourly_rate / 100),
          hourly_rate_cents: p.hourly_rate,
          billable: p.billable,
        }),
      );
      const p = pickProject(archived, a.project, "archived project");
      await c.project.unarchive({ id: p.id });
      return { ok: true, restored: p.label };
    },
  }),

  // ---- invoices
  defineTool({
    name: "create_invoice",
    title: "Create an invoice",
    description:
      "Issue an invoice for a client from billable time between two dates. Totals are computed on the server from the logged entries (one line per project). The number defaults to the next INV-<year>-NNN. This creates a permanent record; confirm the client, period and dates with the user first.",
    access: "write",
    input: z
      .object({
        client: clientRef,
        from: date.describe("First day of the billed period"),
        to: date.describe("Last day of the billed period"),
        issue_date: date,
        due_date: date.nullable().optional(),
        number: z.string().trim().min(1).max(40).optional(),
        notes: z.string().trim().max(1000).default(""),
        include_detail: z.boolean().default(true).describe("Print each entry under the lines"),
        compact_notes: z.boolean().default(false).describe("Shorten entry descriptions to about 100 characters"),
      })
      .refine((v) => v.from <= v.to, { message: "from must be on or before to." }),
    run: async (c, a) => {
      const cl = await resolveClient(c, a.client);
      const number = a.number ?? (await c.invoice.nextNumber({ year: Number(a.issue_date.slice(0, 4)) })).number;
      const created = await c.invoice.create({
        clientId: cl.id,
        from: a.from,
        to: a.to,
        number,
        issueDate: a.issue_date,
        dueDate: a.due_date ?? null,
        notes: a.notes,
        includeDetail: a.include_detail,
        compactNotes: a.compact_notes,
      });
      const s = created.snapshot;
      return {
        id: created.id,
        number: s.number,
        client: cl.name,
        period: `${s.periodFrom} to ${s.periodTo}`,
        hours: hours(s.totalMinutes),
        total: round2(s.totalCents / 100),
        lines: s.lines,
      };
    },
  }),

  defineTool({
    name: "mark_invoice_paid",
    title: "Mark an invoice paid or unpaid",
    description:
      "Record the date an invoice was paid (this matters for cash-basis taxes), or pass null to mark it unpaid again.",
    access: "write",
    idempotent: true,
    input: z.object({ invoice: invoiceRef, paid_date: date.nullable().describe("YYYY-MM-DD, or null for unpaid") }),
    run: async (c, a) => {
      const id = await findInvoiceId(c, a.invoice);
      return c.invoice.markPaid({ id, paidDate: a.paid_date });
    },
  }),

  defineTool({
    name: "delete_invoice",
    title: "Delete an invoice",
    description:
      "Permanently delete an invoice record. The time entries stay. Confirm with the user before calling this.",
    access: "write",
    destructive: true,
    input: z.object({ invoice: invoiceRef }),
    run: async (c, a) => {
      const id = await findInvoiceId(c, a.invoice);
      return c.invoice.delete({ id });
    },
  }),
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** A tool failure as text the model can act on. Raw database messages never leave the server. */
export function describeError(e: unknown): string {
  if (e instanceof TRPCError) {
    if (e.code === "INTERNAL_SERVER_ERROR") {
      console.error("MCP tool error:", e);
      return "Something went wrong. Please try again.";
    }
    if (e.cause instanceof ZodError) return e.cause.issues[0]?.message ?? "That input isn't valid.";
    return e.message;
  }
  console.error("MCP tool error:", e);
  return "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------- resources and prompts

export const RESOURCES = [
  {
    uri: "usehourly://projects",
    name: "projects",
    title: "Projects and clients",
    description: "Every active project with its client and rate.",
    mimeType: "application/json",
  },
  {
    uri: "usehourly://timer",
    name: "timer",
    title: "Running timer",
    description: "The running timer, if any.",
    mimeType: "application/json",
  },
] as const;

export const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "usehourly://entries/{from}/{to}",
    name: "entries",
    title: "Time entries in a date range",
    description: "Entries between two dates (YYYY-MM-DD), with totals.",
    mimeType: "application/json",
  },
] as const;

export async function readResource(c: Caller, uri: string): Promise<unknown> {
  if (uri === "usehourly://projects") return { projects: await listProjects(c) };
  if (uri === "usehourly://timer")
    return TOOLS_BY_NAME.get("get_running_timer")?.run(c, {} as never, { access: "read" } as ToolContext);
  const m = /^usehourly:\/\/entries\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(uri);
  if (m)
    return TOOLS_BY_NAME.get("list_entries")?.run(
      c,
      { from: m[1], to: m[2] } as never,
      { access: "read" } as ToolContext,
    );
  throw new TRPCError({ code: "NOT_FOUND", message: `Unknown resource ${uri}.` });
}

type PromptArg = { name: string; description: string; required: boolean };
export const PROMPTS: {
  name: string;
  title: string;
  description: string;
  arguments: PromptArg[];
  build: (a: Record<string, string>) => string;
}[] = [
  {
    name: "log_session_time",
    title: "Log time for work just done",
    description: "Turn a description of finished work and how long it took into a UseHourly entry.",
    arguments: [
      { name: "date", description: "Local date, YYYY-MM-DD", required: true },
      { name: "duration", description: 'How long, e.g. "1h30"', required: true },
      { name: "what", description: "What was worked on", required: true },
      { name: "project", description: 'Project, as "Client / Project" (optional)', required: false },
    ],
    build: (a) =>
      `Log ${a.duration} on ${a.date} in UseHourly for this work: ${a.what}\n` +
      (a.project
        ? `Project: ${a.project}.\n`
        : "Work out the project with list_projects; if more than one fits, ask me which.\n") +
      "Check list_entries for that day first so nothing is logged twice. Write the note as one or two short sentences, past tense, plain words, leading with the outcome. Then call log_time and tell me what was logged.",
  },
  {
    name: "week_summary",
    title: "Summarize a week",
    description: "Hours per project and per day for the week starting on a Monday.",
    arguments: [{ name: "week_start", description: "The Monday, YYYY-MM-DD", required: true }],
    build: (a) =>
      `Use list_entries for the seven days starting ${a.week_start} (end on the Sunday). Give the total hours, hours per project and per day, and point out days with nothing logged. Keep it short.`,
  },
  {
    name: "invoice_client",
    title: "Prepare an invoice",
    description: "Review a client's unbilled time and issue an invoice after confirmation.",
    arguments: [
      { name: "client", description: "Client name", required: true },
      { name: "from", description: "First day to bill, YYYY-MM-DD", required: true },
      { name: "to", description: "Last day to bill, YYYY-MM-DD", required: true },
    ],
    build: (a) =>
      `Prepare an invoice for ${a.client} for ${a.from} to ${a.to}. List that client's entries in the period with list_entries, summarize hours and the amount per project (rates from list_projects), and show me the proposed invoice number from next_invoice_number. Do not call create_invoice until I confirm the dates, the period and the issue date.`,
  },
];
