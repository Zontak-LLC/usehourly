import { describe, expect, it } from "vitest";

import { addDays } from "@/lib/dates";
import { fetchAllPages, planExport } from "@/lib/export-all";
import { moneyLines, tabCounts } from "@/lib/invoice-list";
import { daysLate } from "@/lib/invoice-mail";
import { appRouter } from "@/server/routers/_app";
import { INVOICE_LIST_ALL_PAGE } from "@/server/routers/invoice";
import { createCallerFactory } from "@/server/trpc";

import { type Invoice, memoryBillingDb } from "./helpers/memory-billing";

/*
 * Issue 451: `invoice.list` stops at the newest 200 invoices, so the money line, the tab counts, the Overdue tab and
 * "Download everything" missed older ones. An account with 250 invoices (the quota allows 2,000) whose oldest 50 hold
 * one unpaid, late invoice: `listAll`, `totals` and `overdue` must all count it.
 */

const TODAY = "2026-11-14";
const caller = (prisma: unknown, userId = "u1") =>
  createCallerFactory(appRouter)({ prisma, userId, session: { user: { id: userId } } } as never);

const row = (n: number, over: Partial<Invoice> = {}): Invoice => {
  const issued = addDays(TODAY, -n - 1);
  return {
    id: `i${String(n).padStart(3, "0")}`,
    user_id: "u1",
    number: `INV-${String(n).padStart(3, "0")}`,
    client_id: "c1",
    client_name: "Acme",
    issue_date: issued,
    due_date: addDays(issued, 30),
    paid_date: addDays(issued, 10),
    period_from: issued,
    period_to: issued,
    total_minutes: 60,
    total_cents: 10_000,
    currency: "USD",
    notes: "",
    summary: "Website",
    created_at: new Date(`${issued}T12:00:00Z`),
    ...over,
  };
};

const OLD_LATE = "i240"; // among the oldest 50 of 250, so outside the newest 200

/** 250 invoices, newest first: n = 0 is yesterday. Paid unless said otherwise. */
function scenario() {
  const db = memoryBillingDb();
  db.invoices.push(
    ...Array.from({ length: 250 }, (_, n) => {
      if (n === 0) return row(n, { paid_date: null, due_date: TODAY }); // due today: not late yet
      if (n === 1) return row(n, { paid_date: null, due_date: null }); // no due date: never late
      if (n === 2) return row(n, { paid_date: null, due_date: addDays(TODAY, 5) }); // due in 5 days
      if (n === 3) return row(n, { due_date: addDays(TODAY, -20) }); // paid, due date long gone
      if (n === 240) return row(n, { paid_date: null, total_cents: 77_700 }); // unpaid, due 210 days ago
      return row(n);
    }),
    // Another account's invoices, one of them late too: never seen by u1.
    row(60, { id: "x1", user_id: "u2", number: "THEIRS-1", client_id: "c9", paid_date: null, total_cents: 99_900 }),
    row(6, { id: "x2", user_id: "u2", number: "THEIRS-2", client_id: "c9" }),
  );
  return db;
}

describe("the old way misses the old invoice (what issue 451 reported)", () => {
  it("invoice.list holds only the newest 200, so the money line built from it has no late money", async () => {
    const list = await caller(scenario().prisma).invoice.list();
    expect(list).toHaveLength(200);
    expect(list.map((i) => i.id)).not.toContain(OLD_LATE);
    expect(moneyLines(list, TODAY)[0].late).toBe(0);
    expect(tabCounts(list, TODAY).overdue).toBe(0);
  });
});

describe("invoice.listAll reads every invoice, a page at a time", () => {
  it("returns 250 distinct invoices over its pages, the old unpaid one included", async () => {
    const c = caller(scenario().prisma);
    const pages: number[] = [];
    const all = await fetchAllPages(async (cursor) => {
      const page = await c.invoice.listAll({ cursor });
      pages.push(page.items.length);
      return page;
    });
    expect(INVOICE_LIST_ALL_PAGE).toBe(500);
    expect(all).toHaveLength(250);
    expect(new Set(all.map((i) => i.id)).size).toBe(250);
    expect(all.map((i) => i.id)).toContain(OLD_LATE);
    // newest first, as the list
    expect(all[0].id).toBe("i000");
    expect(all.at(-1)?.id).toBe("i249");
    expect(pages).toEqual([250]);
  });

  it("pages of 500 at the 2,000 quota: four pages, no row twice, no row lost", async () => {
    const db = memoryBillingDb();
    db.invoices.push(...Array.from({ length: 2_000 }, (_, n) => row(n, { issue_date: addDays(TODAY, -(n % 7)) })));
    const c = caller(db.prisma);
    const pages: number[] = [];
    const all = await fetchAllPages(async (cursor) => {
      const page = await c.invoice.listAll({ cursor });
      pages.push(page.items.length);
      return page;
    });
    expect(pages).toEqual([500, 500, 500, 500]);
    expect(new Set(all.map((i) => i.id)).size).toBe(2_000);
  });

  it("the export built from every page has one invoices.csv row per invoice: 250", async () => {
    const c = caller(scenario().prisma);
    const invoices = await fetchAllPages((cursor) => c.invoice.listAll({ cursor }));
    const plan = await planExport({
      entries: [
        {
          id: "e1",
          project_id: "p1",
          date: "2026-10-20",
          minutes: 60,
          note: "",
          started_at: null,
          project: { name: "Website", hourly_rate: 10_000, billable: true, client: { name: "Acme", color: "#10b981" } },
        },
      ],
      invoices,
      today: TODAY,
    });
    const csv = plan.files.find((f) => f.path === "invoices.csv")?.content as string;
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(251); // the header and 250 invoices
    expect(lines.filter((l) => l.startsWith("INV-240,"))).toHaveLength(1);
    const readme = plan.files.find((f) => f.path === "README.txt")?.content as string;
    expect(readme).toContain("invoices.csv       Your invoice history (250).");
  });
});

describe("invoice.totals counts every invoice on the server", () => {
  it("unpaid and late include the old invoice; the counts cover all 250", async () => {
    const totals = await caller(scenario().prisma).invoice.totals({ today: TODAY });
    expect(totals.money).toEqual([
      // paid: 246 at $100; unpaid: three at $100 and the old $777; late: the old one only
      { currency: "USD", paid: 246 * 10_000, unpaid: 3 * 10_000 + 77_700, late: 77_700 },
    ]);
    expect(totals.counts).toEqual({ all: 250, waiting: 3, overdue: 1, paid: 246 });
  });

  it("matches the browser's rules (moneyLines, tabCounts) worked out over every invoice", async () => {
    const db = scenario();
    const mine = db.invoices.filter((i) => i.user_id === "u1") as Parameters<typeof moneyLines>[0];
    const totals = await caller(db.prisma).invoice.totals({ today: TODAY });
    expect(totals.money).toEqual(moneyLines(mine, TODAY));
    expect(totals.counts).toEqual(tabCounts(mine, TODAY));
  });

  it("keeps USD and EUR on separate lines; an empty currency lands on the default (USD) line", async () => {
    const db = memoryBillingDb();
    db.invoices.push(
      row(1, { paid_date: null, due_date: null, total_cents: 10_000 }),
      row(2, { currency: "EUR", paid_date: null, due_date: addDays(TODAY, -1), total_cents: 5_000 }),
      row(3, { currency: "", total_cents: 2_500 }), // paid, no currency stored
      row(4, { currency: "EUR", total_cents: 1_000 }),
    );
    const totals = await caller(db.prisma).invoice.totals({ today: TODAY });
    expect(totals.money).toEqual([
      { currency: "EUR", paid: 1_000, unpaid: 5_000, late: 5_000 },
      { currency: "USD", paid: 2_500, unpaid: 10_000, late: 0 },
    ]);
    expect(totals.counts).toEqual({ all: 4, waiting: 1, overdue: 1, paid: 2 });
  });

  it("refuses a today that is not a real date", async () => {
    await expect(caller(scenario().prisma).invoice.totals({ today: "2026-02-30" })).rejects.toThrow();
    await expect(caller(scenario().prisma).invoice.overdue({ today: "tomorrow" })).rejects.toThrow();
  });
});

describe("invoice.overdue lists every late, unpaid invoice", () => {
  it("holds the old invoice; due today, paid and no-due-date invoices are not in it (the daysLate rule)", async () => {
    const db = scenario();
    const overdue = await caller(db.prisma).invoice.overdue({ today: TODAY });
    expect(overdue.map((i) => i.id)).toEqual([OLD_LATE]);
    // the same answer as daysLate, invoice by invoice
    const lateByRule = db.invoices.filter((i) => i.user_id === "u1" && daysLate(i as never, TODAY) !== null);
    expect(lateByRule.map((i) => i.id)).toEqual([OLD_LATE]);
    for (const id of ["i000", "i001", "i003"]) expect(overdue.map((i) => i.id)).not.toContain(id);
  });

  it("is newest first, like the list", async () => {
    const db = memoryBillingDb();
    db.invoices.push(
      // due 30 days after issue: all three are late
      row(40, { id: "older", paid_date: null }),
      row(41, { id: "oldest", paid_date: null }),
      row(39, { id: "newest", paid_date: null }),
    );
    const overdue = await caller(db.prisma).invoice.overdue({ today: TODAY });
    expect(overdue.map((i) => i.id)).toEqual(["newest", "older", "oldest"]);
  });
});

describe("another account's invoices never show", () => {
  it("not in listAll, totals or overdue", async () => {
    const db = scenario();
    const theirs = caller(db.prisma, "u2");
    const all = await fetchAllPages((cursor) => theirs.invoice.listAll({ cursor }));
    expect(all.map((i) => i.id).sort()).toEqual(["x1", "x2"]);
    expect((await theirs.invoice.overdue({ today: TODAY })).map((i) => i.id)).toEqual(["x1"]);
    expect((await theirs.invoice.totals({ today: TODAY })).counts).toEqual({
      all: 2,
      waiting: 0,
      overdue: 1,
      paid: 1,
    });

    const mine = caller(db.prisma, "u1");
    const myAll = await fetchAllPages((cursor) => mine.invoice.listAll({ cursor }));
    expect(myAll.map((i) => i.id)).not.toContain("x1");
    expect((await mine.invoice.overdue({ today: TODAY })).map((i) => i.id)).not.toContain("x1");
    expect((await mine.invoice.totals({ today: TODAY })).money[0].unpaid).not.toBeGreaterThan(3 * 10_000 + 77_700);
  });

  it("signed out, every new procedure refuses", async () => {
    const out = createCallerFactory(appRouter)({ prisma: scenario().prisma, session: null } as never);
    await expect(out.invoice.listAll({ cursor: null })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(out.invoice.totals({ today: TODAY })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(out.invoice.overdue({ today: TODAY })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
