import { describe, expect, it } from "vitest";

import { addDays } from "@/lib/dates";
import { invoiceState } from "@/lib/invoice-list";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { fakeInvoices, type HistoryRow as Row } from "./helpers/memory-invoice-history";

/*
 * Issue 499: Invoices showed only the newest 200 invoices (`invoice.list` stops there), so a long-time user could not
 * reach older ones. `invoice.listPage` reads the history 200 at a time, with the tab, the search and the sort applied
 * on the server, until `nextCursor` is null.
 */

const TODAY = "2026-11-18";
const caller = (prisma: unknown, userId: string | null = "u1") =>
  createCallerFactory(appRouter)({ prisma, userId, session: userId ? { user: { id: userId } } : null } as never);

/** Invoice n of u1, issued n + 1 days before today (n = 0 is the newest), paid, with its search text and snapshot. */
const row = (n: number, over: Partial<Row> = {}): Row => {
  const issued = addDays(TODAY, -n - 1);
  const number = `INV-${String(n).padStart(4, "0")}`;
  return {
    id: `i${String(n).padStart(4, "0")}`,
    user_id: "u1",
    number,
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
    search_text: `${number.toLowerCase()} acme website`,
    snapshot: JSON.stringify({ lines: [], detail: [{ note: "Logo refresh" }] }),
    ...over,
  };
};
const rows = (count: number, over: (n: number) => Partial<Row> = () => ({})) =>
  Array.from({ length: count }, (_, n) => row(n, over(n)));

type PageInput = Parameters<ReturnType<typeof caller>["invoice"]["listPage"]>[0];

/** Reads `listPage` until `nextCursor` is null: every item, and each page's size. */
async function readAllPages(prisma: unknown, input: Omit<PageInput, "cursor">) {
  const c = caller(prisma);
  const sizes: number[] = [];
  const items: Awaited<ReturnType<typeof c.invoice.listPage>>["items"] = [];
  let cursor: string | null = null;
  do {
    const page: Awaited<ReturnType<typeof c.invoice.listPage>> = await c.invoice.listPage({ ...input, cursor });
    sizes.push(page.items.length);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return { sizes, items, ids: items.map((i) => i.id) };
}

describe("Invoices reaches every invoice, 200 at a time", () => {
  it("450 invoices: list stops at 200, listPage pages [200, 200, 50] and never shows another account's", async () => {
    const db = fakeInvoices([...rows(450), row(5, { id: "x1", user_id: "u2", number: "THEIRS-1" })]);
    expect(await caller(db.prisma).invoice.list()).toHaveLength(200);
    db.invoice.findMany.mockClear();

    const { sizes, ids, items } = await readAllPages(db.prisma, {});
    expect(sizes).toEqual([200, 200, 50]);
    expect(new Set(ids).size).toBe(450);
    expect(ids).not.toContain("x1");
    expect(ids[0]).toBe("i0000");
    expect(ids.at(-1)).toBe("i0449");
    expect(items.every((i) => i.number.startsWith("INV-"))).toBe(true);
    expect(db.invoice.findMany).toHaveBeenCalledTimes(3);
    for (const [args] of db.invoice.findMany.mock.calls) {
      expect(args.where).toMatchObject({ user_id: "u1" });
      expect(args.take).toBe(201);
      expect(args.orderBy?.at(-1)).toEqual({ id: "asc" });
      // The list's fields only: never the snapshot or the search text (TS4).
      expect(args).toMatchObject({ select: { id: true, number: true, summary: true, total_cents: true } });
      expect(args).not.toHaveProperty("select.snapshot");
      expect(args).not.toHaveProperty("select.search_text");
    }
    expect(db.invoice.findMany.mock.calls[0][0].cursor).toBeUndefined();
    expect(db.invoice.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: "i0200" }, skip: 0 });
    expect(db.invoice.findMany.mock.calls[2][0]).toMatchObject({ cursor: { id: "i0400" }, skip: 0 });
  });

  it("an account with no invoices gets an empty page and no cursor", async () => {
    const db = fakeInvoices([row(0, { id: "x1", user_id: "u2" })]);
    expect(await caller(db.prisma).invoice.listPage({})).toEqual({ items: [], nextCursor: null });
  });
});

describe("the tab, the search and the sort hold on every page", () => {
  it("Paid: 300 paid and 150 unpaid give pages [200, 100], every one paid", async () => {
    const db = fakeInvoices(rows(450, (n) => (n % 3 === 2 ? { paid_date: null } : {})));
    const { sizes, items } = await readAllPages(db.prisma, { status: "paid" });
    expect(sizes).toEqual([200, 100]);
    expect(items.every((i) => i.paid_date !== null)).toBe(true);
    for (const [args] of db.invoice.findMany.mock.calls) expect(args.where).toMatchObject({ paid_date: { not: null } });
  });

  it("Overdue: only unpaid invoices due before today, over two pages, the same ones as invoice.overdue", async () => {
    const db = fakeInvoices(
      rows(400, (n) => {
        if (n < 250) return { paid_date: null, due_date: addDays(TODAY, -1 - n) }; // late
        if (n < 300) return { paid_date: null, due_date: n % 2 ? TODAY : addDays(TODAY, 5) }; // due today or later
        if (n < 330) return { paid_date: null, due_date: null }; // no due date: never late
        return { due_date: addDays(TODAY, -40) }; // paid, due date long gone
      }),
    );
    const { sizes, items, ids } = await readAllPages(db.prisma, { status: "overdue", today: TODAY });
    expect(sizes).toEqual([200, 50]);
    expect(items.every((i) => i.paid_date === null && i.due_date !== null && i.due_date < TODAY)).toBe(true);
    expect(items.every((i) => invoiceState(i, TODAY).tab === "overdue")).toBe(true);
    const overdue = await caller(db.prisma).invoice.overdue({ today: TODAY });
    expect(ids).toEqual(overdue.map((i) => i.id));
  });

  it("Waiting: unpaid with no due date or due today or later; none late, none paid", async () => {
    const db = fakeInvoices(
      rows(60, (n) => {
        if (n < 20) return { paid_date: null, due_date: addDays(TODAY, -1) }; // late
        if (n < 30) return { paid_date: null, due_date: TODAY };
        if (n < 40) return { paid_date: null, due_date: null };
        return {}; // paid
      }),
    );
    const { sizes, ids } = await readAllPages(db.prisma, { status: "waiting", today: TODAY });
    expect(sizes).toEqual([20]);
    expect(ids).toEqual(
      rows(40)
        .slice(20)
        .map((r) => r.id),
    );
  });

  it("the search goes to the server lowercased on page 2 too", async () => {
    const db = fakeInvoices([...rows(250), row(300, { id: "other", search_text: "inv-0300 northwind" })]);
    const { sizes, ids } = await readAllPages(db.prisma, { q: "  ACME " });
    expect(sizes).toEqual([200, 50]);
    expect(ids).not.toContain("other");
    expect(db.invoice.findMany.mock.calls[1][0]).toMatchObject({
      cursor: { id: "i0200" },
      where: { user_id: "u1", search_text: { contains: "acme" } },
    });
  });

  it("Oldest first: issue dates go up across the page break", async () => {
    const db = fakeInvoices(rows(300));
    const { sizes, items } = await readAllPages(db.prisma, { sort: "oldest" });
    expect(sizes).toEqual([200, 100]);
    const dates = items.map((i) => i.issue_date);
    expect(dates).toEqual([...dates].sort());
    expect(items[0].id).toBe("i0299");
    expect(items[199].issue_date < items[200].issue_date).toBe(true);
  });

  it("two invoices issued the same day at rows 200 and 201 come back later-made first, none twice or lost", async () => {
    const day = addDays(TODAY, -200);
    const table = rows(260, (n) => {
      if (n === 199) return { issue_date: day, created_at: new Date(`${day}T09:00:00Z`) }; // made first
      if (n === 200) return { issue_date: day, created_at: new Date(`${day}T15:00:00Z`) }; // made later
      // Three made at the same moment: only the id tells them apart, so it must decide their order.
      if (n >= 201 && n <= 203) return { issue_date: addDays(TODAY, -201), created_at: new Date(0) };
      return {};
    });
    const db = fakeInvoices(table.reverse());
    const { sizes, ids } = await readAllPages(db.prisma, {});
    expect(sizes).toEqual([200, 60]);
    expect(ids[199]).toBe("i0200");
    expect(ids[200]).toBe("i0199");
    expect(ids.slice(201, 204)).toEqual(["i0201", "i0202", "i0203"]);
    expect(new Set(ids).size).toBe(260);
  });
});

describe("who may read the pages, and what is refused before any query", () => {
  it("signed out gets UNAUTHORIZED and nothing is read", async () => {
    const db = fakeInvoices(rows(3));
    await expect(caller(db.prisma, null).invoice.listPage({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ["a 101-character cursor", { cursor: "x".repeat(101) }],
    ["Overdue without today", { status: "overdue" }],
    ["Waiting without today", { status: "waiting" }],
    ["today that is not a date", { status: "overdue", today: "tomorrow" }],
  ])("%s is refused and the table is never read", async (_, input) => {
    const db = fakeInvoices(rows(3));
    await expect(caller(db.prisma).invoice.listPage(input as PageInput)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });

  it("Overdue without today says what is missing", async () => {
    const db = fakeInvoices(rows(3));
    await expect(caller(db.prisma).invoice.listPage({ status: "overdue" })).rejects.toThrow(
      "Pass today for waiting or overdue.",
    );
  });
});

describe("an old invoice with no summary gets one, on any page", () => {
  it("a row on page 2 comes back with the summary worked out from its snapshot, written once", async () => {
    const db = fakeInvoices(rows(250, (n) => (n === 230 ? { summary: "" } : {})));
    const c = caller(db.prisma);
    const first = await c.invoice.listPage({});
    expect(db.invoice.update).not.toHaveBeenCalled();
    const second = await c.invoice.listPage({ cursor: first.nextCursor });
    expect(second.items.find((i) => i.id === "i0230")?.summary).toBe("Logo refresh");
    expect(db.invoice.update).toHaveBeenCalledTimes(1);
    expect(db.invoice.update).toHaveBeenCalledWith({
      where: { id: "i0230", user_id: "u1" },
      data: { summary: "Logo refresh" },
    });
  });
});
