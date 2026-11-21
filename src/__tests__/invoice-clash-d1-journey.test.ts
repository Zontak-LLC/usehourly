import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { fakeD1 } from "./helpers/fake-d1";

/**
 * Two invoices made at the same moment must not bill the same hours. When another invoice takes some of the time while
 * this one is being saved, the save is refused and undone. On D1 the write count includes the rows the
 * `time_entries_log_update` trigger writes to `entry_changes`, so the check reads the marked count back instead. These
 * run the REAL procedure on the REAL Prisma client and D1 adapter over a migrated SQLite that reports changes like D1.
 */

const createCaller = createCallerFactory(appRouter);
const OCTOBER = {
  clientId: "c1",
  from: "2026-10-01",
  to: "2026-10-31",
  issueDate: "2026-11-01",
  number: "INV-2026-001",
};
const CLASH = "Some of this time was just put on another invoice. Check the period and try again.";
/** Prisma's UPDATE that bills entries: UPDATE `main`.`time_entries` SET `invoice_id` = ?, ... */
const MARKING = /^UPDATE\s+`main`\.`time_entries`\s+SET\s+`invoice_id`\s*=/;

type World = { e1OnOther?: boolean; clashMidSave?: boolean };

/** u1 with client c1, billable project p1, entries e1 (Oct 5) and e2 (Oct 20), and an existing invoice `other`. */
function world({ e1OnOther = false, clashMidSave = false }: World = {}) {
  const { db, DB } = fakeD1();
  db.exec(
    `INSERT INTO auth_users (id, name, email, password_hash) VALUES ('u1', 'Jo', 'jo@x.invalid', 'x');
     INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme');
     INSERT INTO projects (id, user_id, client_id, name, hourly_rate, billable) VALUES ('p1', 'u1', 'c1', 'Website', 10000, 1);
     INSERT INTO invoices (id, user_id, client_id, client_name, number, issue_date, period_from, period_to,
       total_minutes, total_cents, snapshot, search_text)
       VALUES ('other', 'u1', 'c1', 'Acme', 'INV-2026-000', '2026-10-25', '2026-10-01', '2026-10-05', 60, 10000, '{}', '');
     INSERT INTO time_entries (id, user_id, project_id, date, minutes, note, invoice_id, created_at, updated_at) VALUES
       ('e1', 'u1', 'p1', '2026-10-05', 60, 'hero', ${e1OnOther ? "'other'" : "NULL"}, '2026-10-05T10:00:00.000Z', '2026-10-05T10:00:00.000Z'),
       ('e2', 'u1', 'p1', '2026-10-20', 30, 'nav', NULL, '2026-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z');`,
  );
  const injected = { times: 0 };
  // The other invoice takes e1 in SQLite just before this save's marking statement runs: it read both entries, but
  // can only mark e2. Deterministic, not raced.
  const clashingDB = {
    ...DB,
    prepare(sql: string) {
      if (clashMidSave && injected.times === 0 && MARKING.test(sql)) {
        injected.times++;
        db.exec("UPDATE time_entries SET invoice_id = 'other' WHERE id = 'e1'");
      }
      return DB.prepare(sql);
    },
  };
  const prisma = new PrismaClient({ adapter: new PrismaD1(clashingDB as never) });
  const c = createCaller({ session: { user: { id: "u1" }, expires: "" } as never, prisma });
  const invoiceOf = (id: string) =>
    (db.prepare("SELECT invoice_id FROM time_entries WHERE id = ?").get(id) as { invoice_id: string | null })
      .invoice_id;
  const numbered = (number: string) =>
    db.prepare("SELECT id FROM invoices WHERE user_id = 'u1' AND number = ?").all(number) as { id: string }[];
  return { c, injected, invoiceOf, numbered };
}

describe("an invoice that clashes with another one at the same moment, on D1", () => {
  it("is refused and undone when another invoice takes some of its time mid-save", async () => {
    const w = world({ clashMidSave: true });

    await expect(w.c.invoice.create(OCTOBER)).rejects.toMatchObject({ code: "CONFLICT", message: CLASH });

    expect(w.injected.times).toBe(1);
    expect(w.numbered("INV-2026-001")).toEqual([]);
    expect(w.invoiceOf("e1")).toBe("other");
    expect(w.invoiceOf("e2")).toBeNull();
  });

  it("is saved with both entries on it when nothing clashes, though the trigger doubles the write count", async () => {
    const w = world();

    const created = await w.c.invoice.create(OCTOBER);

    expect(w.numbered("INV-2026-001")).toEqual([{ id: created.id }]);
    expect(w.invoiceOf("e1")).toBe(created.id);
    expect(w.invoiceOf("e2")).toBe(created.id);
  });

  it("is saved when billing again on purpose, and the time already billed keeps its first invoice", async () => {
    const w = world({ e1OnOther: true });

    const created = await w.c.invoice.create({ ...OCTOBER, includeInvoiced: true });

    expect(w.numbered("INV-2026-001")).toEqual([{ id: created.id }]);
    expect(w.invoiceOf("e1")).toBe("other");
    expect(w.invoiceOf("e2")).toBe(created.id);
  });
});
