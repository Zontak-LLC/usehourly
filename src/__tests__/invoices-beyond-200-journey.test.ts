import { describe, expect, it } from "vitest";

import { invoiceResults } from "@/lib/global-search";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import {
  C1_COUNT,
  C1_UNPAID,
  C2_COUNT,
  C2_UNPAID,
  OLDEST_NUMBER,
  seedBeyond200,
  U1_UNPAID_CENTS,
} from "./helpers/invoices-beyond-200";
import { fakeInvoices } from "./helpers/memory-invoice-history";

/*
 * A freelancer with 208 invoices opens Clients: each client's "Invoices · N" counts every invoice, and the client's
 * Invoices tab pages through all of them, not only those among the newest 200. Global search still finds the oldest.
 */

const caller = (prisma: unknown, userId: string | null = "u1") =>
  createCallerFactory(appRouter)({ prisma, userId, session: userId ? { user: { id: userId } } : null } as never);

describe("Clients counts every invoice of each client", () => {
  it("countByClient gives Acme 205 and Globex 3, and never another account's client", async () => {
    const db = fakeInvoices(seedBeyond200());
    const counts = await caller(db.prisma).invoice.countByClient();
    expect(counts).toHaveLength(2);
    expect(counts).toEqual(
      expect.arrayContaining([
        { clientId: "c1", count: C1_COUNT },
        { clientId: "c2", count: C2_COUNT },
      ]),
    );
    // One grouped read of the caller's own invoices, no invoice rows (TS4).
    expect(db.invoice.groupBy).toHaveBeenCalledTimes(1);
    expect(db.invoice.groupBy.mock.calls[0][0]).toMatchObject({ by: ["client_id"], where: { user_id: "u1" } });
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });

  it("Acme's Invoices tab reads 200, then the last 5, ending with its oldest invoice", async () => {
    const c = caller(fakeInvoices(seedBeyond200()).prisma);
    const first = await c.invoice.listPage({ clientId: "c1" });
    expect(first.items).toHaveLength(200);
    expect(first.items.every((i) => i.client_id === "c1")).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await c.invoice.listPage({ clientId: "c1", cursor: first.nextCursor });
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect(second.items.at(-1)?.number).toBe(OLDEST_NUMBER);
  });
});

describe("matchTotals covers every match, not the newest 200", () => {
  it("unpaid: 205 invoices worth $21,300.00, the oldest ones included", async () => {
    const totals = await caller(fakeInvoices(seedBeyond200()).prisma).invoice.matchTotals({ status: "unpaid" });
    expect(totals).toEqual({ count: C1_UNPAID + C2_UNPAID, unpaid: [{ currency: "USD", cents: U1_UNPAID_CENTS }] });
    expect(totals.count).toBe(205);
    expect(U1_UNPAID_CENTS).toBe(2_130_000);
  });

  it("paid: 3 matches and no unpaid money", async () => {
    const totals = await caller(fakeInvoices(seedBeyond200()).prisma).invoice.matchTotals({ status: "paid" });
    expect(totals).toEqual({ count: 3, unpaid: [] });
  });
});

describe("who may read the counts, and what is refused before any read", () => {
  it("signed out gets UNAUTHORIZED from countByClient and matchTotals, and nothing is read", async () => {
    const db = fakeInvoices(seedBeyond200());
    const c = caller(db.prisma, null);
    await expect(c.invoice.countByClient()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(c.invoice.matchTotals()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.invoice.groupBy).not.toHaveBeenCalled();
  });

  it("a date that is not YYYY-MM-DD is BAD_REQUEST and the table is never read", async () => {
    const db = fakeInvoices(seedBeyond200());
    await expect(caller(db.prisma).invoice.matchTotals({ from: "October" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(db.invoice.groupBy).not.toHaveBeenCalled();
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });
});

describe("global search still finds the oldest invoice", () => {
  it("invoice.list({ q }) returns only u1's INV-1999-001, and the search box shows it", async () => {
    const found = await caller(fakeInvoices(seedBeyond200()).prisma).invoice.list({ q: "inv-1999-001" });
    expect(found.map((i) => [i.id, i.number])).toEqual([["a204", OLDEST_NUMBER]]);
    const results = invoiceResults(found);
    expect(results.map((r) => r.title)).toEqual([OLDEST_NUMBER]);
  });
});
