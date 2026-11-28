import { describe, expect, it } from "vitest";

import { setup } from "./helpers/mcp-world";

/**
 * An assistant asks what a client's unbilled time comes to, then bills it: the preview must match the invoice to the
 * cent, and nothing is left afterwards. The database is a small in-memory stand-in that really filters, so the
 * entries the tool reads are the ones the invoice marks.
 */

/** A list inside a tool result, typed for the check at hand. */
const listOf = <T>(data: Record<string, unknown> | undefined, key: string) => (data?.[key] ?? []) as T[];

const period = { from: "2026-10-01", to: "2026-10-31" };
const invoiceArgs = { client: "Acme", ...period, issue_date: "2026-11-01" };

type Project = { id: string; name: string; hourly_rate: number; billable: boolean };
const website: Project = { id: "p1", name: "Website", hourly_rate: 9500, billable: true };
const design: Project = { id: "p2", name: "Design", hourly_rate: 6000, billable: true };
const support: Project = { id: "p4", name: "Support", hourly_rate: 5000, billable: false };
const initechProject: Project = { id: "p9", name: "Secret", hourly_rate: 20000, billable: true };

const client = (id: string, name: string, userId: string, projects: Project[], extra = {}) => ({
  id,
  name,
  user_id: userId,
  color: "#6366f1",
  legal_name: null,
  address: null,
  archived: false,
  projects,
  ...extra,
});

type Row = {
  id: string;
  user_id: string;
  project_id: string;
  date: string;
  minutes: number;
  note: string;
  started_at: Date | null;
  invoice_id: string | null;
  project: Project & { client_id: string };
};
let nextId = 0;
const entry = (project: Project, date: string, minutes: number, over: Partial<Row> = {}): Row => ({
  id: `e${++nextId}`,
  user_id: "u1",
  project_id: project.id,
  date,
  minutes,
  note: `${project.name} work`,
  started_at: null,
  invoice_id: null,
  project: { ...project, client_id: project.id === initechProject.id ? "c9" : "c1" },
  ...over,
});

/** A connected account over a stateful fake: entries, invoices and the clients of two different accounts. */
function world(access = "write", acmeExtra = {}) {
  const s = setup({ access });
  const clients = [
    client("c1", "Acme", "u1", [website, design, support], acmeExtra),
    client("c9", "Initech", "u2", [initechProject]),
  ];
  const earlier = { id: "inv-old", user_id: "u1", number: "INV-2026-004" };
  const invoices = [earlier];
  const seed = {
    web1: entry(website, "2026-10-05", 30),
    web2: entry(website, "2026-10-06", 20),
    des1: entry(design, "2026-10-07", 37),
    support: entry(support, "2026-10-07", 60),
    outside: entry(website, "2026-11-03", 40),
    onEarlier: entry(website, "2026-10-08", 15, { invoice_id: earlier.id }),
    running: entry(website, "2026-10-09", 5, { started_at: new Date("2026-10-09T09:00:00Z") }),
    offDay: entry(design, "2026-10-10", 25),
    other: entry(initechProject, "2026-10-05", 600, { user_id: "u2" }),
  };
  const entries = Object.values(seed);
  s.prisma.nonBillableRows.push({ user_id: "u1", date: "2026-10-10" });

  type Where = Record<string, unknown> & { date?: { gte: string; lte: string }; project?: { client_id: string } };
  s.prisma.client.findMany.mockImplementation((async ({ where }: { where: { user_id: string } }) =>
    clients.filter((c) => c.user_id === where.user_id)) as never);
  s.prisma.client.findFirst.mockImplementation(
    (async ({ where }: { where: { id: string; user_id: string } }) =>
      clients.find((c) => c.id === where.id && c.user_id === where.user_id) ?? null) as never,
  );
  s.prisma.project.findMany.mockImplementation((async () =>
    clients.flatMap((c) => c.projects.map((p) => ({ ...p, client_id: c.id, user_id: c.user_id })))) as never);
  s.prisma.timeEntry.findMany.mockImplementation((async ({ where }: { where: Where }) =>
    entries.filter(
      (e) =>
        e.user_id === where.user_id &&
        (!where.date || (e.date >= where.date.gte && e.date <= where.date.lte)) &&
        (!where.project || e.project.client_id === where.project.client_id) &&
        (where.invoice_id !== null || e.invoice_id === null) &&
        (where.started_at !== null || e.started_at === null),
    )) as never);
  const marking = s.prisma.timeEntry.updateMany.getMockImplementation();
  s.prisma.timeEntry.updateMany.mockImplementation((async (args: {
    where: { id?: { in: string[] }; invoice_id?: string | null };
    data: { invoice_id: string | null };
  }) => {
    for (const e of entries) {
      const hit = args.where.id ? args.where.id.in.includes(e.id) && e.invoice_id === null : true;
      const onInvoice = "invoice_id" in args.where && !args.where.id ? e.invoice_id === args.where.invoice_id : true;
      if (hit && onInvoice) e.invoice_id = args.data.invoice_id;
    }
    return marking?.(args as never);
  }) as never);
  s.prisma.invoice.findFirst.mockImplementation(
    (async ({ where }: { where: { number: string } }) =>
      invoices.find((i) => i.number === where.number) ?? null) as never,
  );
  s.prisma.invoice.findMany.mockImplementation((async ({
    where,
    select,
  }: {
    where: { id?: { in: string[] }; number?: { startsWith: string } };
    select: object;
  }) => {
    if (where.id) return invoices.filter((i) => where.id?.in.includes(i.id)).map(({ id, number }) => ({ id, number }));
    return Object.keys(select).join() === "number" ? invoices.map(({ number }) => ({ number })) : [];
  }) as never);
  s.prisma.invoice.create.mockImplementation((async ({ data }: { data: { number: string } }) => {
    const created = { id: "inv-new", user_id: "u1", number: data.number };
    invoices.push(created);
    return { id: created.id };
  }) as never);

  const state = () => JSON.stringify({ invoices: invoices.length, entries: entries.map((e) => e.invoice_id) });
  return { s, seed, state };
}

describe("unbilled_time: what the invoice would be, without making one", () => {
  it("matches what create_invoice then bills to the cent, leaves nothing after it and marks the entries billed", async () => {
    const { s, seed, state } = world();
    const before = state();
    const preview = await s.call("unbilled_time", { client: "Acme", ...period });
    expect(preview.isError).toBe(false);
    expect(state()).toBe(before); // a read: no invoice made, no entry marked
    expect(s.prisma.invoice.create).not.toHaveBeenCalled();
    // 50 min at $95/h is $79.1667 -> $79.17; 37 min at $60/h is $37.00
    expect(preview.data).toEqual({
      client: "Acme",
      currency: "USD",
      ...period,
      total_minutes: 87,
      total_hours: 1.45,
      total: 116.17,
      projects: [
        {
          project_id: "p2",
          project: "Design",
          minutes: 37,
          hours: 0.62,
          rate: 60,
          amount: 37,
          entry_ids: [seed.des1.id],
        },
        {
          project_id: "p1",
          project: "Website",
          minutes: 50,
          hours: 0.83,
          rate: 95,
          amount: 79.17,
          entry_ids: [seed.web1.id, seed.web2.id],
        },
      ],
    });

    const made = await s.call("create_invoice", invoiceArgs);
    expect(made.isError).toBe(false);
    const lines = listOf<{ projectId: string; amountCents: number }>(made.data, "lines");
    const projects = listOf<{ project_id: string; amount: number }>(preview.data, "projects");
    expect(lines.map((l) => [l.projectId, l.amountCents / 100])).toEqual(projects.map((p) => [p.project_id, p.amount]));
    expect(made.data).toMatchObject({ total: preview.data?.total, hours: preview.data?.total_hours });

    const after = await s.call("unbilled_time", { client: "Acme", ...period });
    expect(after.isError).toBe(false);
    expect(after.data).toMatchObject({ projects: [], total_minutes: 0, total: 0 });

    const listed = await s.call("list_entries", { from: "2026-10-01", to: "2026-11-30" });
    const billedBy = Object.fromEntries(
      listOf<{ id: string; billed: string | null }>(listed.data, "entries").map((e) => [e.id, e.billed]),
    );
    const number = made.data?.number;
    expect(billedBy[seed.web1.id]).toBe(number);
    expect(billedBy[seed.web2.id]).toBe(number);
    expect(billedBy[seed.des1.id]).toBe(number);
    expect(billedBy[seed.onEarlier.id]).toBe("INV-2026-004");
    for (const e of [seed.support, seed.outside, seed.running, seed.offDay]) expect(billedBy[e.id]).toBeNull();
  });

  it("leaves out time on an earlier invoice, a running timer and a non-billable day", async () => {
    const { s, seed } = world();
    const r = await s.call("unbilled_time", { client: "Acme", ...period });
    const ids = listOf<{ entry_ids: string[] }>(r.data, "projects").flatMap((p) => p.entry_ids);
    expect(ids.sort()).toEqual([seed.web1.id, seed.web2.id, seed.des1.id].sort());
    for (const e of [seed.onEarlier, seed.running, seed.offDay, seed.support, seed.outside]) {
      expect(ids).not.toContain(e.id);
    }
    expect(r.data?.total_minutes).toBe(87);
  });

  it("bills the minutes the client's rounding rule gives, as the invoice does", async () => {
    const { s } = world("write", { round_step: 15, round_mode: "up", round_min: 0 });
    const preview = await s.call("unbilled_time", { client: "Acme", ...period });
    // Website: 30 + 20 -> 30 + 30 = 60 min; Design: 37 -> 45 min
    expect(
      listOf<{ project: string; minutes: number }>(preview.data, "projects").map((p) => [p.project, p.minutes]),
    ).toEqual([
      ["Design", 45],
      ["Website", 60],
    ]);
    const made = await s.call("create_invoice", invoiceArgs);
    expect(made.data).toMatchObject({ hours: preview.data?.total_hours, total: preview.data?.total });
    expect(listOf<{ project: string; minutes: number }>(made.data, "lines").map((l) => [l.project, l.minutes])).toEqual(
      [
        ["Design", 45],
        ["Website", 60],
      ],
    );
  });

  it("works with a read-only token, which still cannot create an invoice", async () => {
    const { s, state } = world("read");
    const before = state();
    const r = await s.call("unbilled_time", { client: "Acme", ...period });
    expect(r.isError).toBe(false);
    expect(r.data).toMatchObject({ total: 116.17 });
    expect((await s.call("create_invoice", invoiceArgs)).isError).toBe(true);
    expect(state()).toBe(before);
  });

  it("never shows another account's client or time", async () => {
    const { s } = world();
    for (const client of ["Initech", "c9"]) {
      const r = await s.call("unbilled_time", { client, ...period });
      expect(r.isError).toBe(true);
      expect(r.text).toContain("No client matches");
      expect(r.text).not.toContain("Secret");
    }
  });

  it("refuses bad periods with a plain message and changes nothing", async () => {
    const { s, state } = world();
    const before = state();
    const backwards = await s.call("unbilled_time", { client: "Acme", from: "2026-10-31", to: "2026-10-01" });
    expect(backwards.isError).toBe(true);
    expect(backwards.text).not.toContain("Something went wrong");
    const tooLong = await s.call("unbilled_time", { client: "Acme", from: "2025-01-01", to: "2026-12-31" });
    expect(tooLong.isError).toBe(true);
    expect(tooLong.text).toContain("up to a year");
    expect(state()).toBe(before);
  });

  it("returns an empty preview, not an error, for a period with nothing to bill", async () => {
    const { s } = world();
    const r = await s.call("unbilled_time", { client: "Acme", from: "2026-01-01", to: "2026-01-31" });
    expect(r.isError).toBe(false);
    expect(r.data).toMatchObject({ projects: [], total_minutes: 0, total_hours: 0, total: 0 });
  });
});
