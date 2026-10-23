import { describe, expect, it, vi } from "vitest";

import { nextInvoiceNumber } from "@/lib/unbilled";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryInvoiceLogos } from "./helpers/memory-invoice-logos";
import { memoryNonBillableDays } from "./helpers/memory-non-billable";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Money right (issue #178, 2026-10-23): the same hours are never billed twice. Each entry remembers the invoice it was
 * billed on; a new invoice takes only unbilled time and marks it; "not invoiced yet" is what is left; deleting an
 * invoice frees its time; the next number never clashes.
 */

type Entry = {
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
type Where = {
  user_id: string;
  project?: { client_id: string };
  invoice_id?: null;
  started_at?: null;
  id?: { in: string[] };
  date?: { gte: string; lte: string } | { in: string[] };
};

/** A small in-memory database with just the reads and writes making an invoice uses, for two accounts. */
function memoryDb() {
  const projects: Project[] = [
    { id: "p1", user_id: "u1", client_id: "c1", name: "Website", hourly_rate: 10000, billable: true },
    { id: "p2", user_id: "u1", client_id: "c1", name: "Admin", hourly_rate: 0, billable: false },
    { id: "p9", user_id: "u2", client_id: "c9", name: "Theirs", hourly_rate: 9900, billable: true },
  ];
  const entries: Entry[] = [
    {
      id: "e1",
      user_id: "u1",
      project_id: "p1",
      date: "2026-10-02",
      minutes: 90,
      note: "hero",
      started_at: null,
      invoice_id: null,
    },
    {
      id: "e2",
      user_id: "u1",
      project_id: "p1",
      date: "2026-10-03",
      minutes: 30,
      note: "nav",
      started_at: null,
      invoice_id: null,
    },
    {
      id: "e3",
      user_id: "u1",
      project_id: "p2",
      date: "2026-10-03",
      minutes: 60,
      note: "sync",
      started_at: null,
      invoice_id: null,
    },
    {
      id: "e9",
      user_id: "u2",
      project_id: "p9",
      date: "2026-10-02",
      minutes: 600,
      note: "x",
      started_at: null,
      invoice_id: null,
    },
  ];
  const invoices: { id: string; user_id: string; number: string }[] = [];
  const matches = (e: Entry, w: Where) =>
    e.user_id === w.user_id &&
    (!w.date || ("in" in w.date ? w.date.in.includes(e.date) : e.date >= w.date.gte && e.date <= w.date.lte)) &&
    (!("started_at" in w) || e.started_at === null) &&
    (!w.project || projects.find((p) => p.id === e.project_id)?.client_id === w.project.client_id) &&
    (!("invoice_id" in w) || e.invoice_id === w.invoice_id) &&
    (!w.id || w.id.in.includes(e.id));
  const prisma = {
    ...memoryInvoiceLogos(),
    ...memoryNonBillableDays(),
    client: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; user_id: string } }) =>
        where.user_id === "u1" && where.id === "c1" ? { id: "c1", name: "Acme", user_id: "u1" } : null,
      ),
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
      findMany: vi.fn(async ({ where }: { where: { user_id: string; number: { startsWith: string } } }) =>
        invoices.filter((i) => i.user_id === where.user_id && i.number.startsWith(where.number.startsWith)),
      ),
      create: vi.fn(async ({ data }: { data: { user_id: string; number: string } }) => {
        const row = { id: `inv${invoices.length + 1}`, user_id: data.user_id, number: data.number };
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
  return { prisma, entries, invoices, nonBillableRows: prisma.nonBillableRows };
}

const caller = (prisma: unknown, userId = "u1") =>
  createCallerFactory(appRouter)({ prisma, userId, session: { user: { id: userId } } } as never);

const october = {
  clientId: "c1",
  from: "2026-10-01",
  to: "2026-10-31",
  issueDate: "2026-11-01",
  dueDate: "2026-11-15",
};

describe("money right: the same hours are never billed twice", () => {
  it("an invoice takes the unbilled time and marks it; a second invoice for the same period is refused", async () => {
    const { prisma, entries } = memoryDb();
    const c = caller(prisma);
    expect(await c.invoice.unbilled()).toEqual([
      { clientId: "c1", minutes: 120, cents: 20000, from: "2026-10-02", to: "2026-10-03" },
    ]);

    const { snapshot } = await c.invoice.create({ ...october, number: "INV-2026-001" });
    expect(snapshot.totalCents).toBe(20000);
    expect(entries.filter((e) => e.invoice_id === "inv1").map((e) => e.id)).toEqual(["e1", "e2"]); // billable time only
    expect(entries.find((e) => e.id === "e3")?.invoice_id).toBeNull(); // non-billable stays unmarked
    expect(await c.invoice.unbilled()).toEqual([]); // nothing left to bill

    await expect(c.invoice.create({ ...october, number: "INV-2026-002" })).rejects.toThrow(/not on an invoice already/);

    // Time logged after the invoice is billed next time, and only that time.
    entries.push({
      id: "e4",
      user_id: "u1",
      project_id: "p1",
      date: "2026-10-20",
      minutes: 60,
      note: "more",
      started_at: null,
      invoice_id: null,
    });
    const second = await c.invoice.create({ ...october, number: "INV-2026-002" });
    expect(second.snapshot.totalCents).toBe(10000);
    expect(entries.find((e) => e.id === "e4")?.invoice_id).toBe("inv2");
    expect(entries.find((e) => e.id === "e1")?.invoice_id).toBe("inv1"); // the first invoice keeps its own time
  });

  it("billing time again happens only when asked for", async () => {
    const { prisma, entries } = memoryDb();
    const c = caller(prisma);
    await c.invoice.create({ ...october, number: "INV-2026-001" });
    const again = await c.invoice.create({ ...october, number: "INV-2026-002", includeInvoiced: true });
    expect(again.snapshot.totalCents).toBe(20000);
    // billed again on purpose: the time keeps its first invoice, so deleting the new one never frees billed time
    expect(entries.filter((e) => e.invoice_id === "inv1").map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("if another invoice takes some of the time meanwhile, this one is taken back and nothing stays marked", async () => {
    const { prisma, entries, invoices } = memoryDb();
    // Between reading the entries and marking them, a second invoice (made at the same moment) took e2.
    prisma.timeEntry.findMany.mockImplementationOnce(async ({ where }: { where: Where }) => {
      const rows = entries.filter((e) => e.user_id === where.user_id && e.invoice_id === null);
      const answer = rows.map((e) => ({
        ...e,
        project: {
          id: e.project_id,
          user_id: "u1",
          name: "Website",
          hourly_rate: 10000,
          billable: e.project_id === "p1",
          client_id: "c1",
        },
      }));
      (entries.find((e) => e.id === "e2") as Entry).invoice_id = "other";
      return answer.filter((e) => e.user_id === "u1");
    });
    await expect(caller(prisma).invoice.create({ ...october, number: "INV-2026-001" })).rejects.toThrow(
      /just put on another invoice/,
    );
    expect(invoices).toEqual([]); // the clashing invoice was removed
    expect(entries.find((e) => e.id === "e1")?.invoice_id).toBeNull(); // and its marks taken back
    expect(entries.find((e) => e.id === "e2")?.invoice_id).toBe("other"); // the other invoice keeps its time
  });

  it("deleting an invoice frees its time to be billed again", async () => {
    const { prisma } = memoryDb();
    const c = caller(prisma);
    const made = await c.invoice.create({ ...october, number: "INV-2026-001" });
    await c.invoice.delete({ id: made.id });
    expect((await c.invoice.unbilled())[0]?.cents).toBe(20000);
  });

  it("another account's time never counts, and its invoices never take mine", async () => {
    const { prisma, entries } = memoryDb();
    expect((await caller(prisma, "u2").invoice.unbilled())[0]).toMatchObject({ clientId: "c9", minutes: 600 });
    await caller(prisma).invoice.create({ ...october, number: "INV-2026-001" });
    expect(entries.find((e) => e.id === "e9")?.invoice_id).toBeNull();
    expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user_id: "u1" }) }),
    );
  });

  it("time on a day marked non-billable and a running timer are not waiting to be billed, and never billed", async () => {
    const { prisma, entries, nonBillableRows } = memoryDb();
    nonBillableRows.push({ user_id: "u1", date: "2026-10-03" }); // e2 (30 min) is on it
    entries.push({
      id: "e5",
      user_id: "u1",
      project_id: "p1",
      date: "2026-10-04",
      minutes: 45,
      note: "running",
      started_at: "2026-10-04T09:00:00Z",
      invoice_id: null,
    });
    const c = caller(prisma);
    expect((await c.invoice.unbilled())[0]).toMatchObject({ minutes: 90, cents: 15000 }); // e1 only: not e2 (a non-billable day), not e5 (running)
    const { snapshot } = await c.invoice.create({ ...october, number: "INV-2026-001" });
    expect(snapshot.totalCents).toBe(15000);
    expect(entries.find((e) => e.id === "e5")?.invoice_id).toBeNull(); // billed once it is stopped
  });

  it("billed and unbilled entries cannot be merged into one", async () => {
    const rows = [
      {
        id: "a",
        user_id: "u1",
        project_id: "p1",
        date: "2026-10-02",
        minutes: 30,
        note: "",
        started_at: null,
        invoice_id: "inv1",
      },
      {
        id: "b",
        user_id: "u1",
        project_id: "p1",
        date: "2026-10-02",
        minutes: 45,
        note: "",
        started_at: null,
        invoice_id: null,
      },
    ];
    const prisma = { timeEntry: { findMany: vi.fn(async () => rows), update: vi.fn(), deleteMany: vi.fn() } };
    await expect(caller(prisma).entry.merge({ ids: ["a", "b"] })).rejects.toThrow(
      /already on an invoice and some are not/,
    );
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    expect(prisma.timeEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("the next number is one more than the highest used, whatever was deleted", () => {
    expect(nextInvoiceNumber(2026, [])).toBe("INV-2026-001");
    expect(nextInvoiceNumber(2026, ["INV-2026-001", "INV-2026-003"])).toBe("INV-2026-004");
    expect(nextInvoiceNumber(2026, ["INV-2025-009", "INV-2026-002", "INV-2026-custom"])).toBe("INV-2026-003");
  });
});

/** The migration on a real SQLite database: existing invoices are backfilled, and deleting one frees its time. */
describe("migration 0035 on a real database", () => {
  function migratedUpTo(last: string) {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    const dir = path.join(process.cwd(), "migrations");
    const files = readdirSync(dir)
      .filter((n) => n.endsWith(".sql"))
      .sort();
    const apply = (keep: (f: string) => boolean) => {
      for (const f of files.filter(keep)) db.exec(readFileSync(path.join(dir, f), "utf8"));
    };
    apply((f) => f < last);
    return { db, rest: () => apply((f) => f >= last) };
  }

  it("marks what an old invoice must have billed, leaves the rest, and frees it when the invoice is deleted", () => {
    const { db, rest } = migratedUpTo("0035");
    const run = (sql: string) => db.exec(sql);
    run(`INSERT INTO auth_users (id, email, password_hash) VALUES ('u1', 'jo@example.com', 'x')`);
    run(`INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme'), ('c2', 'u1', 'Beta')`);
    run(`INSERT INTO projects (id, user_id, client_id, name, billable) VALUES
      ('p1', 'u1', 'c1', 'Website', 1), ('p2', 'u1', 'c1', 'Admin', 0), ('p3', 'u1', 'c2', 'Other', 1)`);
    const entry = (id: string, project: string, date: string, created: string) =>
      run(`INSERT INTO time_entries (id, user_id, project_id, date, minutes, created_at, updated_at)
           VALUES ('${id}', 'u1', '${project}', '${date}', 60, '${created}', '${created}')`);
    entry("before", "p1", "2026-10-05", "2026-10-05T10:00:00.000Z"); // billed by INV-001
    entry("nonbillable", "p2", "2026-10-05", "2026-10-05T10:00:00.000Z"); // non-billable project
    entry("otherclient", "p3", "2026-10-05", "2026-10-05T10:00:00.000Z"); // another client
    entry("outside", "p1", "2026-11-02", "2026-11-02T10:00:00.000Z"); // after the period
    entry("latecomer", "p1", "2026-10-06", "2026-11-03T10:00:00.000Z"); // logged after the invoice was made
    run(`INSERT INTO invoices (id, user_id, client_id, client_name, number, issue_date, period_from, period_to,
           total_minutes, total_cents, snapshot, search_text, created_at)
         VALUES ('inv1', 'u1', 'c1', 'Acme', 'INV-2026-001', '2026-11-01', '2026-10-01', '2026-10-31', 60, 6000, '{}', '',
           '2026-11-01T09:00:00.000Z')`);

    rest(); // migration 0035 and anything after it
    const billedOn = (id: string) =>
      (db.prepare("SELECT invoice_id FROM time_entries WHERE id = ?").get(id) as { invoice_id: string | null })
        .invoice_id;
    expect(billedOn("before")).toBe("inv1");
    for (const id of ["nonbillable", "otherclient", "outside", "latecomer"]) expect(billedOn(id), id).toBeNull();

    run("DELETE FROM invoices WHERE id = 'inv1'");
    expect(billedOn("before")).toBeNull(); // ON DELETE SET NULL: the time can be billed again
  });
});
