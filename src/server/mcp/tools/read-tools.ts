import { z } from "zod";

import { scheduleOf } from "@/lib/invoice-schedule";
import { currencyOrDefault, effectiveCurrency } from "@/lib/money";

import { defineTool, type McpTool } from "./core";
import { type EntryRow, shapeEntry, summarize } from "./entry-shape";
import { hours, round2 } from "./format";
import { clientRef, date, projectRef } from "./inputs";
import { listProjects, resolveClient, resolveProject } from "./lookup";

export const READ_TOOLS: McpTool[] = [
  // ---- reading
  defineTool({
    name: "whoami",
    title: "Who am I",
    description:
      "The signed-in account (name, email, currency, business details printed on invoices) and what this token may do (read or write). Call this first to confirm the connection.",
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
        currency: currencyOrDefault(me.currency),
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
    input: z.object({ include_archived: z.boolean().default(false).describe("Also list archived projects") }),
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
    description:
      "Active clients, each with its currency and its active projects. Rates are in the client's currency (its own, else the account's).",
    access: "read",
    idempotent: true,
    input: z.object({}),
    run: async (c) => {
      const [clients, me] = await Promise.all([c.clients.list(), c.account.me()]);
      return {
        clients: clients.map((cl) => ({
          id: cl.id,
          name: cl.name,
          color: cl.color,
          legal_name: cl.legal_name,
          address: cl.address,
          currency: effectiveCurrency(cl.currency, me.currency),
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
    description:
      "One client's billing details: full legal name and address as printed on invoices, and how often the client is invoiced (invoice_schedule: null = whenever the freelancer chooses).",
    access: "read",
    idempotent: true,
    input: z.object({ client: clientRef }),
    run: async (c, a) => {
      const cl = await resolveClient(c, a.client);
      const [full, me] = await Promise.all([c.clients.get({ id: cl.id }), c.account.me()]);
      return {
        id: full.id,
        name: full.name,
        legal_name: full.legal_name,
        address: full.address,
        currency: effectiveCurrency(full.currency, me.currency),
        has_logo: Boolean(full.logo),
        invoice_schedule: scheduleOf(full),
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
      .object({
        from: date.describe("First day to include, YYYY-MM-DD"),
        to: date.describe("Last day to include (inclusive), YYYY-MM-DD"),
        project: projectRef.optional().describe('Only this project: id or "Client / Project"'),
      })
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
    input: z.object({
      from: date.describe("First day of the range, YYYY-MM-DD"),
      to: date.describe("Last day of the range (inclusive), YYYY-MM-DD"),
    }),
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
    input: z.object({ year: z.number().int().min(2000).max(2100).describe("Calendar year, e.g. 2026") }),
    run: (c, a) => c.report.annual(a),
  }),
];
