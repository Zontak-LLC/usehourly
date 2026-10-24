import { vi } from "vitest";

import { memoryInvoiceLogos } from "./memory-invoice-logos";
import { memoryNonBillableDays } from "./memory-non-billable";

/*
 * A small in-memory database with the reads and writes that making an invoice and "not invoiced yet" use, for two
 * accounts (u1 owns client c1 "Acme", u2 owns c9). Shared by the money-right (issue 178) and invoice-schedule
 * (issue 100) journeys.
 */

export type Entry = {
  id: string;
  user_id: string;
  project_id: string;
  date: string;
  minutes: number;
  note: string;
  started_at: string | null;
  invoice_id: string | null;
};
type Project = { id: string; user_id: string; client_id: string; name: string; hourly_rate: number; billable: boolean };
export type Client = {
  id: string;
  user_id: string;
  name: string;
  archived: boolean;
  invoice_every: string | null;
  invoice_anchor: string | null;
};
type Invoice = {
  id: string;
  user_id: string;
  number: string;
  client_id: string;
  period_from: string;
  period_to: string;
};
export type Where = {
  user_id: string;
  project?: { client_id: string | { in: string[] } };
  invoice_id?: null;
  started_at?: null;
  id?: { in: string[] };
  date?: { gte: string; lte: string } | { in: string[] };
};
type InvoiceWhere = {
  user_id: string;
  number?: { startsWith: string };
  client_id?: { in: string[] };
  period_to?: { gte: string };
};

const entry = (
  id: string,
  user_id: string,
  project_id: string,
  date: string,
  minutes: number,
  note: string,
): Entry => ({
  id,
  user_id,
  project_id,
  date,
  minutes,
  note,
  started_at: null,
  invoice_id: null,
});

export function memoryBillingDb() {
  const projects: Project[] = [
    { id: "p1", user_id: "u1", client_id: "c1", name: "Website", hourly_rate: 10000, billable: true },
    { id: "p2", user_id: "u1", client_id: "c1", name: "Admin", hourly_rate: 0, billable: false },
    { id: "p9", user_id: "u2", client_id: "c9", name: "Theirs", hourly_rate: 9900, billable: true },
  ];
  const clients: Client[] = [
    { id: "c1", user_id: "u1", name: "Acme", archived: false, invoice_every: null, invoice_anchor: null },
    { id: "c9", user_id: "u2", name: "Theirs", archived: false, invoice_every: null, invoice_anchor: null },
  ];
  const entries: Entry[] = [
    entry("e1", "u1", "p1", "2026-10-02", 90, "hero"),
    entry("e2", "u1", "p1", "2026-10-03", 30, "nav"),
    entry("e3", "u1", "p2", "2026-10-03", 60, "sync"),
    entry("e9", "u2", "p9", "2026-10-02", 600, "x"),
  ];
  const invoices: Invoice[] = [];
  const clientOf = (e: Entry) => projects.find((p) => p.id === e.project_id)?.client_id;
  const inClient = (e: Entry, w: Where["project"]) =>
    !w || (typeof w.client_id === "string" ? clientOf(e) === w.client_id : w.client_id.in.includes(clientOf(e) ?? ""));
  const matches = (e: Entry, w: Where) =>
    e.user_id === w.user_id &&
    (!w.date || ("in" in w.date ? w.date.in.includes(e.date) : e.date >= w.date.gte && e.date <= w.date.lte)) &&
    (!("started_at" in w) || e.started_at === null) &&
    inClient(e, w.project) &&
    (!("invoice_id" in w) || e.invoice_id === w.invoice_id) &&
    (!w.id || w.id.in.includes(e.id));
  const invoiceMatches = (i: Invoice, w: InvoiceWhere) =>
    i.user_id === w.user_id &&
    (!w.number || i.number.startsWith(w.number.startsWith)) &&
    (!w.client_id || w.client_id.in.includes(i.client_id)) &&
    (!w.period_to || i.period_to >= w.period_to.gte);
  const prisma = {
    ...memoryInvoiceLogos(),
    ...memoryNonBillableDays(),
    client: {
      findFirst: vi.fn(
        async ({ where }: { where: { id?: string; user_id: string } }) =>
          clients.find((c) => c.id === where.id && c.user_id === where.user_id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: { user_id: string; invoice_every?: { not: null } } }) =>
        clients.filter(
          (c) => c.user_id === where.user_id && !c.archived && (!where.invoice_every || c.invoice_every !== null),
        ),
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string; user_id: string }; data: Partial<Client> }) => {
        const c = clients.find((x) => x.id === where.id && x.user_id === where.user_id);
        if (!c) throw new Error("Record to update not found.");
        Object.assign(c, data);
        return { id: c.id };
      }),
    },
    project: {
      findMany: vi.fn(async ({ where }: { where: { user_id: string } }) =>
        projects.filter((p) => p.user_id === where.user_id),
      ),
    },
    timeEntry: {
      findMany: vi.fn(async ({ where }: { where: Where }) =>
        entries
          .filter((e) => matches(e, where))
          .map((e) => ({ ...e, project: projects.find((p) => p.id === e.project_id) })),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: { invoice_id: string | null } }) => {
        const hit = entries.filter((e) => matches(e, where));
        for (const e of hit) e.invoice_id = data.invoice_id;
        return { count: hit.length };
      }),
      groupBy: vi.fn(async ({ where }: { where: Where }) => {
        const out = new Map<
          string,
          { project_id: string; _sum: { minutes: number }; _min: { date: string }; _max: { date: string } }
        >();
        for (const e of entries.filter((x) => matches(x, where) && x.minutes > 0)) {
          const g = out.get(e.project_id) ?? {
            project_id: e.project_id,
            _sum: { minutes: 0 },
            _min: { date: e.date },
            _max: { date: e.date },
          };
          g._sum.minutes += e.minutes;
          if (e.date < g._min.date) g._min.date = e.date;
          if (e.date > g._max.date) g._max.date = e.date;
          out.set(e.project_id, g);
        }
        return [...out.values()];
      }),
    },
    invoice: {
      count: vi.fn(
        async ({ where }: { where: { user_id: string } }) => invoices.filter((i) => i.user_id === where.user_id).length,
      ),
      findFirst: vi.fn(
        async ({ where }: { where: { user_id: string; number: string } }) =>
          invoices.find((i) => i.user_id === where.user_id && i.number === where.number) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: InvoiceWhere }) => invoices.filter((i) => invoiceMatches(i, where))),
      create: vi.fn(async ({ data }: { data: Omit<Invoice, "id"> }) => {
        const row = {
          id: `inv${invoices.length + 1}`,
          user_id: data.user_id,
          number: data.number,
          client_id: data.client_id,
          period_from: data.period_from,
          period_to: data.period_to,
        };
        invoices.push(row);
        return { id: row.id };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: string; user_id: string } }) => {
        const before = invoices.length;
        const keep = invoices.filter((i) => !(i.id === where.id && i.user_id === where.user_id));
        invoices.splice(0, invoices.length, ...keep);
        // what the foreign key does in the real database: ON DELETE SET NULL
        for (const e of entries) if (e.invoice_id === where.id) e.invoice_id = null;
        return { count: before - keep.length };
      }),
    },
    authUser: {
      findUnique: vi.fn(async () => ({
        id: "u1",
        name: "Jo",
        email: "jo@example.com",
        business_name: "Jo LLC",
        ein: null,
        address: null,
        logo: null,
        payment_instructions: null,
        currency: "USD",
        is_demo: false,
      })),
    },
  };
  return { prisma, entries, invoices, clients, nonBillableRows: prisma.nonBillableRows, entry };
}
