import { describe, expect, it, vi } from "vitest";

import { nextInvoiceNumber } from "@/lib/unbilled";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { type Entry, memoryBillingDb, type Where } from "./helpers/memory-billing";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Money right (issue #178, 2026-10-23): the same hours are never billed twice. Each entry remembers the invoice it was
 * billed on; a new invoice takes only unbilled time and marks it; "not invoiced yet" is what is left; deleting an
 * invoice frees its time; the next number never clashes.
 */

const memoryDb = memoryBillingDb;

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
