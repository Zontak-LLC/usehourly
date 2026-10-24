import { describe, expect, it, vi } from "vitest";

import type { InvoiceSnapshot } from "@/lib/invoice";
import {
  byMonth,
  filterInvoices,
  invoiceFromSnapshot,
  invoiceIdFromPath,
  invoicePath,
  invoiceState,
  type ListInvoice,
  moneyLines,
  tabCounts,
} from "@/lib/invoice-list";
import { splitIdFromPath } from "@/lib/split-path";
import { usagePageForPath } from "@/lib/usage";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryInvoiceLogos } from "./helpers/memory-invoice-logos";

/*
 * Invoices as a split view (2026-10-24): the list's rules (state in words, tabs, search, month groups, the money line),
 * each invoice's address, and `invoice.latest`, which lets the page show the newest invoice in its first request.
 */

const TODAY = "2026-10-24";
const inv = (over: Partial<ListInvoice>): ListInvoice => ({
  id: "i1",
  number: "INV-2026-001",
  client_id: "c1",
  client_name: "Acme",
  summary: "Website",
  issue_date: "2026-10-01",
  due_date: "2026-10-31",
  paid_date: null,
  period_from: "2026-09-01",
  period_to: "2026-09-30",
  total_minutes: 600,
  total_cents: 100_000,
  currency: "USD",
  ...over,
});

const waiting = inv({ id: "w", number: "INV-2026-003", due_date: "2026-10-29" });
const late = inv({
  id: "l",
  number: "INV-2026-002",
  client_name: "Northwind",
  summary: "Logo",
  due_date: "2026-10-12",
});
const paid = inv({ id: "p", number: "INV-2026-001", issue_date: "2026-09-02", paid_date: "2026-10-20" });
const euro = inv({ id: "e", number: "INV-2026-004", currency: "EUR", total_cents: 5_000, due_date: null });
const list = [waiting, late, paid, euro];

describe("each invoice says its state in words", () => {
  it("paid, late, due in N days, due today, or waiting", () => {
    expect(invoiceState(paid, TODAY)).toMatchObject({ tab: "paid", words: "Paid Oct 20" });
    expect(invoiceState(late, TODAY)).toMatchObject({ tab: "overdue", words: "12 days late", late: 12 });
    expect(invoiceState(inv({ due_date: "2026-10-23" }), TODAY)).toMatchObject({ words: "1 day late", late: 1 });
    expect(invoiceState(waiting, TODAY)).toMatchObject({ tab: "waiting", words: "Due in 5 days" });
    expect(invoiceState(inv({ due_date: TODAY }), TODAY)).toMatchObject({ tab: "waiting", words: "Due today" });
    expect(invoiceState(euro, TODAY)).toMatchObject({ tab: "waiting", words: "Waiting" });
    // before the browser says what day it is nothing is called late
    expect(invoiceState(late, null)).toMatchObject({ tab: "waiting", words: "Waiting" });
  });
});

describe("the tabs, the search and the month groups", () => {
  it("counts each tab and shows only its invoices", () => {
    expect(tabCounts(list, TODAY)).toEqual({ all: 4, waiting: 2, overdue: 1, paid: 1 });
    expect(filterInvoices(list, "overdue", "", TODAY).map((i) => i.id)).toEqual(["l"]);
    expect(filterInvoices(list, "paid", "", TODAY).map((i) => i.id)).toEqual(["p"]);
    expect(filterInvoices(list, "waiting", "", TODAY).map((i) => i.id)).toEqual(["w", "e"]);
    expect(filterInvoices(list, "all", "", TODAY)).toHaveLength(4);
  });

  it("every typed word must be in the number, the client or what it was for", () => {
    expect(filterInvoices(list, "all", "north logo", TODAY).map((i) => i.id)).toEqual(["l"]);
    expect(filterInvoices(list, "all", "  INV-2026-00 acme ", TODAY).map((i) => i.id)).toEqual(["w", "p", "e"]);
    expect(filterInvoices(list, "all", "north website", TODAY)).toEqual([]);
    expect(filterInvoices(list, "paid", "northwind", TODAY)).toEqual([]); // the tab still applies
  });

  it("groups by the month issued, keeping the list's order", () => {
    expect(byMonth(list).map((m) => [m.key, m.items.map((i) => i.id)])).toEqual([
      ["2026-10", ["w", "l"]],
      ["2026-09", ["p"]],
      ["2026-10", ["e"]],
    ]);
  });

  it("the money line: paid, unpaid (late included) and late, never adding two currencies", () => {
    expect(moneyLines(list, TODAY)).toEqual([
      { currency: "USD", paid: 100_000, unpaid: 200_000, late: 100_000 },
      { currency: "EUR", paid: 0, unpaid: 5_000, late: 0 },
    ]);
  });
});

describe("every invoice has its own address", () => {
  it("reads the invoice an address names, never the builder or a deeper page", () => {
    expect(invoicePath("a b")).toBe("/dashboard/invoices/a%20b");
    expect(invoiceIdFromPath(invoicePath("a b"))).toBe("a b");
    expect(invoiceIdFromPath("/dashboard/invoices/abc/")).toBe("abc");
    expect(invoiceIdFromPath("/dashboard/invoices")).toBeNull();
    expect(invoiceIdFromPath("/dashboard/invoices/new")).toBeNull();
    expect(invoiceIdFromPath("/dashboard/invoices/abc/edit")).toBeNull();
    expect(invoiceIdFromPath("/dashboard/invoicesabc")).toBeNull();
    expect(invoiceIdFromPath("/dashboard/invoices/%E0%A4%A")).toBeNull(); // a broken address is no invoice
    expect(splitIdFromPath("/dashboard/clients/archived", "/dashboard/clients", ["archived"])).toBeNull();
  });

  it("an invoice's own address counts as Invoices; the builder keeps its own name", () => {
    expect(usagePageForPath("/dashboard/invoices/abc")).toBe("invoices");
    expect(usagePageForPath("/dashboard/invoices/new")).toBe("new-invoice");
  });

  it("an invoice the list does not hold gets its header from its frozen copy", () => {
    const s = {
      number: "INV-2019-001",
      issueDate: "2019-02-01",
      dueDate: "2019-03-01",
      periodFrom: "2019-01-01",
      periodTo: "2019-01-31",
      client: { name: "Old Co" },
      totalMinutes: 60,
      totalCents: 9_000,
    } as InvoiceSnapshot;
    expect(invoiceFromSnapshot("old", s, "2019-03-02")).toMatchObject({
      id: "old",
      number: "INV-2019-001",
      client_name: "Old Co",
      paid_date: "2019-03-02",
      total_cents: 9_000,
      currency: "USD",
    });
  });
});

/* invoice.latest: the newest of the CALLER's invoices, in the list's order. */

type Row = {
  id: string;
  user_id: string;
  client_id: string | null;
  issue_date: string;
  created_at: Date;
  paid_date: string | null;
  snapshot: string;
};

const frozen = (number: string) =>
  JSON.stringify({
    seller: { name: "Jo", ein: null, address: null, email: "jo@example.com", logo: null, paymentInstructions: null },
    client: { name: "Acme", legalName: null, address: null, logo: null },
    number,
  });

function store(rows: Row[]) {
  const matches = (r: Row, where: Partial<Row>) => Object.entries(where).every(([k, v]) => r[k as keyof Row] === v);
  return {
    ...memoryInvoiceLogos(),
    invoice: {
      findFirst: vi.fn(async ({ where, orderBy }: { where: Partial<Row>; orderBy?: unknown }) => {
        const found = rows.filter((r) => matches(r, where));
        if (orderBy)
          found.sort((a, b) =>
            a.issue_date === b.issue_date
              ? b.created_at.getTime() - a.created_at.getTime()
              : b.issue_date.localeCompare(a.issue_date),
          );
        return found[0] ?? null;
      }),
      update: vi.fn(async () => ({})),
    },
  };
}

const caller = (prisma: unknown, userId: string | null) =>
  createCallerFactory(appRouter)({
    session: userId ? { user: { id: userId }, expires: "" } : null,
    prisma: prisma as never,
  });

describe("invoice.latest opens the newest invoice without knowing its id", () => {
  const rows: Row[] = [
    {
      id: "a",
      user_id: "u1",
      client_id: "c1",
      issue_date: "2026-09-01",
      created_at: new Date(1),
      paid_date: null,
      snapshot: frozen("INV-A"),
    },
    {
      id: "b",
      user_id: "u1",
      client_id: "c1",
      issue_date: "2026-10-01",
      created_at: new Date(1),
      paid_date: "2026-10-20",
      snapshot: frozen("INV-B"),
    },
    {
      id: "c",
      user_id: "u1",
      client_id: "c1",
      issue_date: "2026-10-01",
      created_at: new Date(2),
      paid_date: null,
      snapshot: frozen("INV-C"),
    },
    // another account's newer invoice is never handed over
    {
      id: "x",
      user_id: "u2",
      client_id: "c9",
      issue_date: "2026-12-01",
      created_at: new Date(9),
      paid_date: null,
      snapshot: frozen("INV-X"),
    },
  ];

  it("gives the caller's newest (latest issue date, then the last made), like the top of the list", async () => {
    const prisma = store(rows);
    const got = await caller(prisma, "u1").invoice.latest();
    expect(got).toMatchObject({ id: "c", paidDate: null });
    expect(got?.snapshot.number).toBe("INV-C");
    expect(prisma.invoice.findFirst.mock.calls[0][0]).toMatchObject({
      where: { user_id: "u1" },
      orderBy: [{ issue_date: "desc" }, { created_at: "desc" }],
    });
    // the same answer invoice.get gives for that id
    expect(await caller(prisma, "u1").invoice.get({ id: "c" })).toEqual(got);
  });

  it("another account gets its own, and an account with none gets null", async () => {
    expect((await caller(store(rows), "u2").invoice.latest())?.id).toBe("x");
    expect(await caller(store(rows), "u3").invoice.latest()).toBeNull();
  });

  it("refuses a signed-out caller", async () => {
    const prisma = store(rows);
    await expect(caller(prisma, null).invoice.latest()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.invoice.findFirst).not.toHaveBeenCalled();
  });
});
