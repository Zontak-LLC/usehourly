import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import { buildAnnualReport } from "@/lib/annual-report";
import {
  expenseFields,
  mileageCents,
  netCents,
  parseAmount,
  parseDistance,
  parseMileageRate,
  rateInput,
  readExpenseFields,
  summarizeExpenses,
} from "@/lib/expenses";
import { buildAnnualWorkbook } from "@/lib/export-annual-xlsx";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

/**
 * Expenses and mileage (issue 100, first slice): a freelancer records what they spent and the trips they drove, and the
 * Year summary adds them up by category and quarter, nets them against payments received, and puts them in Excel.
 */
const createCaller = createCallerFactory(appRouter);

type Row = Record<string, unknown> & { id: string; user_id: string; date: string; created_at: number };

/** An in-memory `expenses` table and two accounts' clients, with just the Prisma calls the router makes. */
function world(opts: { count?: number } = {}) {
  let rows: Row[] = [];
  let seq = 0;
  const clients = [
    { id: "c1", user_id: "u1", name: "Acme" },
    { id: "c2", user_id: "u2", name: "Globex" },
  ];
  const owns = (r: Row, where: { id?: string; user_id?: string }) =>
    (where.id === undefined || r.id === where.id) && (where.user_id === undefined || r.user_id === where.user_id);
  const withClient = (r: Row) => ({
    ...r,
    client: r.client_id ? { name: clients.find((c) => c.id === r.client_id)?.name ?? "" } : null,
  });
  const prisma = {
    authUser: { findUnique: vi.fn(async () => ({ currency: "USD" })) },
    client: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; user_id: string } }) =>
          clients.find((c) => c.id === where.id && c.user_id === where.user_id) ?? null,
      ),
    },
    expense: {
      count: vi.fn(
        async ({ where }: { where: { user_id: string } }) =>
          opts.count ?? rows.filter((r) => r.user_id === where.user_id).length,
      ),
      create: vi.fn(async ({ data }: { data: Omit<Row, "id" | "created_at"> }) => {
        seq += 1;
        const row = { ...data, id: `x${seq}`, created_at: seq } as Row;
        rows.push(row);
        return withClient(row);
      }),
      findMany: vi.fn(async ({ where }: { where: { user_id: string; date: { gte: string; lte: string } } }) =>
        rows
          .filter((r) => r.user_id === where.user_id && r.date >= where.date.gte && r.date <= where.date.lte)
          .sort((a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at)
          .map(withClient),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; user_id: string }; data: Partial<Row> }) => {
        const hit = rows.filter((r) => owns(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: string; user_id: string } }) => {
        const before = rows.length;
        rows = rows.filter((r) => !owns(r, where));
        return { count: before - rows.length };
      }),
    },
  };
  const as = (id: string, demo = false) =>
    createCaller({
      session: { user: { id, ...(demo ? { demo: true } : {}) }, expires: "" } as never,
      prisma: prisma as never,
    });
  return { prisma, as, rows: () => rows };
}

const YEAR = { from: "2026-01-01", to: "2026-12-31" };

describe("the expense rules", () => {
  it("reads amounts, distances and rates the way people type them", () => {
    expect(parseAmount("12.50")).toEqual({ cents: 1250 });
    expect(parseAmount("$1,234.56")).toEqual({ cents: 123456 });
    expect(parseAmount("12,5")).toEqual({ cents: 1250 }); // a decimal comma
    expect(parseAmount("0")).toEqual({ error: "The amount must be more than zero." });
    expect(parseAmount("ten")).toEqual({ error: "Type the amount as a number, like 12.50." });
    expect(parseAmount("1000000.01")).toEqual({ error: "That amount is too large for one expense." });
    expect(parseDistance("12.3")).toEqual({ distance: 123 });
    expect(parseDistance("0")).toEqual({ error: "The distance must be more than zero." });
    // a rate in dollars ("0.70") or in cents ("70") is the same rate; 72.5 cents keeps its half cent
    expect(parseMileageRate("0.70")).toEqual({ rate: 700 });
    expect(parseMileageRate("70")).toEqual({ rate: 700 });
    expect(parseMileageRate("0.725")).toEqual({ rate: 725 });
    expect(rateInput(700)).toBe("0.70");
    expect(rateInput(725)).toBe("0.725");
  });

  it("works out a trip from its distance and rate, to the cent", () => {
    expect(mileageCents(123, 700)).toBe(861); // 12.3 mi at $0.70 = $8.61
    expect(mileageCents(1, 725)).toBe(7); // 0.1 mi at $0.725 = 7.25 cents, rounded
    expect(netCents(100000, 25000)).toBe(75000);
  });

  it("adds a year up by category and by quarter, leaving other years out", () => {
    const s = summarizeExpenses(
      [
        { date: "2026-01-15", category: "software", amount_cents: 1200, kind: "expense", distance: null },
        { date: "2026-02-01", category: "software", amount_cents: 800, kind: "expense", distance: null },
        { date: "2026-05-20", category: "mileage", amount_cents: 861, kind: "mileage", distance: 123 },
        { date: "2026-12-31", category: "equipment", amount_cents: 150000, kind: "expense", distance: null },
        { date: "2025-12-31", category: "equipment", amount_cents: 999999, kind: "expense", distance: null },
      ],
      2026,
    );
    expect(s.count).toBe(4);
    expect(s.totalCents).toBe(152861);
    expect(s.byCategory).toEqual([
      { category: "equipment", label: "Equipment", count: 1, cents: 150000 },
      { category: "software", label: "Software and subscriptions", count: 2, cents: 2000 },
      { category: "mileage", label: "Mileage", count: 1, cents: 861 },
    ]);
    expect(s.byQuarter.map((q) => q.cents)).toEqual([2000, 861, 0, 150000]);
    expect(s.mileage).toEqual({ trips: 1, cents: 861, distance: { mi: 123, km: 0 } });
  });

  it("turns the form's boxes into what the server takes, and back", () => {
    const blank = expenseFields(undefined, "2026-10-23");
    expect(blank).toMatchObject({ kind: "expense", date: "2026-10-23", rate: "0.70", unit: "mi" });
    expect(readExpenseFields(blank)).toEqual({ error: "Type the amount as a number, like 12.50." });
    expect(readExpenseFields({ ...blank, amount: "49", category: "software", note: "  Figma  " })).toEqual({
      draft: {
        kind: "expense",
        date: "2026-10-23",
        category: "software",
        amountCents: 4900,
        note: "Figma",
        clientId: null,
      },
    });
    // a typed-in "mileage" category can never make a plain expense look like a trip
    expect(readExpenseFields({ ...blank, amount: "5", category: "mileage" })).toMatchObject({
      draft: { category: "other" },
    });
    const trip = {
      ...blank,
      kind: "mileage" as const,
      distance: "40",
      unit: "km" as const,
      rate: "0.30",
      clientId: "c1",
    };
    expect(readExpenseFields(trip)).toEqual({
      draft: { kind: "mileage", date: "2026-10-23", distance: 400, unit: "km", rate: 300, note: "", clientId: "c1" },
    });
    const again = expenseFields(
      {
        kind: "mileage",
        date: "2026-03-02",
        category: "mileage",
        amount_cents: 1200,
        note: null,
        client_id: "c1",
        distance: 400,
        distance_unit: "km",
        mileage_rate: 300,
      },
      "2026-10-23",
    );
    expect(again).toMatchObject({ kind: "mileage", date: "2026-03-02", distance: "40", unit: "km", rate: "0.30" });
  });
});

describe("recording expenses", () => {
  it("adds an expense and a trip, works the trip out on the server, and lists the year newest first", async () => {
    const w = world();
    const me = w.as("u1");
    const bought = await me.expense.create({
      kind: "expense",
      date: "2026-02-10",
      category: "software",
      amountCents: 4900,
      note: " Figma ",
      clientId: null,
    });
    expect(bought).toMatchObject({ amount_cents: 4900, category: "software", note: "Figma", currency: "USD" });

    // the browser sends distance and rate only; the amount is never taken from it
    const drove = await me.expense.create({
      kind: "mileage",
      date: "2026-03-05",
      distance: 123,
      unit: "mi",
      rate: 700,
      clientId: "c1",
      ...({ amountCents: 1 } as object),
    });
    expect(drove).toMatchObject({
      kind: "mileage",
      category: "mileage",
      amount_cents: 861,
      distance: 123,
      distance_unit: "mi",
      mileage_rate: 700,
      client: { name: "Acme" },
    });

    await me.expense.create({ kind: "expense", date: "2025-12-31", category: "equipment", amountCents: 9 });
    const list = await me.expense.list(YEAR);
    expect(list.map((e) => e.date)).toEqual(["2026-03-05", "2026-02-10"]);
  });

  it("edits an expense into a trip and back, leaving nothing of the other kind behind", async () => {
    const w = world();
    const me = w.as("u1");
    const e = await me.expense.create({ kind: "expense", date: "2026-04-01", category: "travel", amountCents: 3000 });
    await me.expense.update({
      id: e.id,
      expense: { kind: "mileage", date: "2026-04-01", distance: 100, unit: "km", rate: 300 },
    });
    expect(w.rows()[0]).toMatchObject({ kind: "mileage", category: "mileage", amount_cents: 300, distance: 100 });
    await me.expense.update({
      id: e.id,
      expense: { kind: "expense", date: "2026-04-02", category: "meals", amountCents: 2500, note: "" },
    });
    expect(w.rows()[0]).toMatchObject({
      kind: "expense",
      category: "meals",
      amount_cents: 2500,
      distance: null,
      distance_unit: null,
      mileage_rate: null,
      note: null,
    });
  });

  it("deletes an expense", async () => {
    const w = world();
    const me = w.as("u1");
    const e = await me.expense.create({ kind: "expense", date: "2026-04-01", category: "fees", amountCents: 100 });
    expect(await me.expense.delete({ id: e.id })).toEqual({ id: e.id });
    expect(await me.expense.list(YEAR)).toEqual([]);
  });
});

describe("one account never sees or touches another's expenses", () => {
  it("lists only the caller's own", async () => {
    const w = world();
    await w.as("u1").expense.create({ kind: "expense", date: "2026-05-01", category: "office", amountCents: 500 });
    expect(await w.as("u2").expense.list(YEAR)).toEqual([]);
    expect(w.prisma.expense.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user_id: "u2" }) }),
    );
  });

  it("refuses to edit or delete someone else's expense, and changes nothing", async () => {
    const w = world();
    const e = await w
      .as("u1")
      .expense.create({ kind: "expense", date: "2026-05-01", category: "office", amountCents: 500 });
    await expect(
      w.as("u2").expense.update({
        id: e.id,
        expense: { kind: "expense", date: "2026-05-01", category: "office", amountCents: 1 },
      }),
    ).rejects.toThrow("Expense not found.");
    await expect(w.as("u2").expense.delete({ id: e.id })).rejects.toThrow("Expense not found.");
    expect(w.rows()).toHaveLength(1);
    expect(w.rows()[0].amount_cents).toBe(500);
  });

  it("refuses a client that belongs to another account", async () => {
    const w = world();
    await expect(
      w
        .as("u1")
        .expense.create({ kind: "expense", date: "2026-05-01", category: "office", amountCents: 500, clientId: "c2" }),
    ).rejects.toThrow("Client not found.");
    expect(w.prisma.expense.create).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    const w = world();
    const anon = createCaller({ session: null, prisma: w.prisma as never });
    await expect(anon.expense.list(YEAR)).rejects.toThrow();
    expect(w.prisma.expense.findMany).not.toHaveBeenCalled();
  });
});

/** An `expenses` table for `listAll`: honours where.user_id (none = every row, as Prisma would), the order, `take` and a cursor. */
function exportWorld(rows: Row[]) {
  const findMany = vi.fn(async (args: { where: { user_id?: string }; take?: number; cursor?: { id: string } }) => {
    const hit = rows
      .filter((r) => args.where.user_id === undefined || r.user_id === args.where.user_id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at || a.id.localeCompare(b.id));
    const start = Math.max(args.cursor ? hit.findIndex((r) => r.id === args.cursor?.id) : 0, 0);
    return hit.slice(start, start + (args.take ?? hit.length)).map((r) => ({ ...r, client: null }));
  });
  const prisma = { expense: { findMany } };
  const as = (id: string) => createCaller({ session: { user: { id }, expires: "" } as never, prisma: prisma as never });
  return { prisma, as };
}

describe("every expense for 'export everything'", () => {
  const spent = (id: string, user_id: string, date: string): Row => ({
    id,
    user_id,
    date,
    created_at: 1,
    kind: "expense",
  });
  const drove = (id: string, user_id: string, date: string): Row => ({
    id,
    user_id,
    date,
    created_at: 1,
    kind: "mileage",
  });

  it("hands over all of the caller's expenses and trips over two years, and none of another account's", async () => {
    const w = exportWorld([
      spent("a1", "u1", "2025-02-10"),
      spent("a2", "u1", "2025-08-01"),
      spent("a3", "u1", "2026-09-30"),
      drove("a4", "u1", "2025-11-02"),
      drove("a5", "u1", "2026-03-04"),
      spent("b1", "u2", "2026-01-01"),
    ]);
    const mine = await w.as("u1").expense.listAll({});
    expect(mine.items.map((e) => e.id)).toEqual(["a3", "a5", "a4", "a2", "a1"]);
    expect(mine.nextCursor).toBeNull();
    expect(w.prisma.expense.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { user_id: "u1" }, take: 2001 }),
    );

    const theirs = await w.as("u2").expense.listAll({});
    expect(theirs.items.map((e) => e.id)).toEqual(["b1"]);
    expect(w.prisma.expense.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { user_id: "u2" } }));
  });

  it("pages 2,000 at a time, each row once, and refuses a runaway cursor", async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => spent(`x${String(i).padStart(5, "0")}`, "u1", "2026-05-01"));
    const me = exportWorld(rows).as("u1");
    const first = await me.expense.listAll({});
    expect(first.items).toHaveLength(2000);
    expect(first.nextCursor).toBe("x02000");
    const second = await me.expense.listAll({ cursor: first.nextCursor });
    expect(second.items.map((e) => e.id)).toEqual(["x02000"]);
    expect(second.nextCursor).toBeNull();
    await expect(me.expense.listAll({ cursor: "x".repeat(101) })).rejects.toThrow();
  });

  it("refuses a signed-out caller", async () => {
    const w = exportWorld([spent("a1", "u1", "2026-01-01")]);
    const anon = createCaller({ session: null, prisma: w.prisma as never });
    await expect(anon.expense.listAll({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(w.prisma.expense.findMany).not.toHaveBeenCalled();
  });
});

describe("what the server refuses", () => {
  it("refuses bad input before touching the database", async () => {
    const w = world();
    const me = w.as("u1");
    const bad = [
      { kind: "expense", date: "2026-02-30", category: "office", amountCents: 100 },
      { kind: "expense", date: "2026-02-01", category: "office", amountCents: 0 },
      { kind: "expense", date: "2026-02-01", category: "office", amountCents: 1.5 },
      { kind: "expense", date: "2026-02-01", category: "mileage", amountCents: 100 },
      { kind: "expense", date: "2026-02-01", category: "bribes", amountCents: 100 },
      { kind: "mileage", date: "2026-02-01", distance: 0, unit: "mi", rate: 700 },
      { kind: "mileage", date: "2026-02-01", distance: 10, unit: "leagues", rate: 700 },
      { kind: "expense", date: "2026-02-01", category: "office", amountCents: 100, note: "x".repeat(501) },
    ];
    for (const input of bad) {
      await expect(me.expense.create(input as never), JSON.stringify(input)).rejects.toThrow();
    }
    expect(w.prisma.expense.create).not.toHaveBeenCalled();
    expect(w.prisma.expense.count).not.toHaveBeenCalled();
    await expect(me.expense.list({ from: "2025-01-01", to: "2026-12-31" })).rejects.toThrow();
    expect(w.prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it("stops at the account's limit, and the demo's much smaller one", async () => {
    await expect(
      world({ count: 10_000 })
        .as("u1")
        .expense.create({ kind: "expense", date: "2026-05-01", category: "office", amountCents: 1 }),
    ).rejects.toThrow(/limit of 10,000 expenses/);
    await expect(
      world({ count: 100 })
        .as("u1", true)
        .expense.create({ kind: "expense", date: "2026-05-01", category: "office", amountCents: 1 }),
    ).rejects.toThrow(/demo is limited to 100 expenses/);
  });
});

describe("expenses in the Year summary's Excel file", () => {
  it("adds an Expenses sheet with a live total, and the net to the Summary", async () => {
    const report = buildAnnualReport({ year: 2026, entries: [], projects: [], invoices: [] });
    const wb = await buildAnnualWorkbook(report, { name: null, ein: null }, [
      {
        date: "2026-05-20",
        kind: "mileage",
        category: "mileage",
        amount_cents: 861,
        note: "Client site",
        distance: 123,
        distance_unit: "mi",
        mileage_rate: 700,
        client: { name: "Acme" },
      },
      {
        date: "2026-01-15",
        kind: "expense",
        category: "software",
        amount_cents: 1200,
        note: null,
        distance: null,
        distance_unit: null,
        mileage_rate: null,
        client: null,
      },
    ]);
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(await wb.xlsx.writeBuffer());
    expect(read.worksheets.map((s) => s.name)).toContain("Expenses");
    const sheet = read.getWorksheet("Expenses");
    expect(sheet?.getRow(2).values).toEqual([undefined, "2026-01-15", "Software and subscriptions", "", "", 12]);
    expect(sheet?.getRow(3).values).toEqual([
      undefined,
      "2026-05-20",
      "Mileage",
      "12.3 mi at 0.70 per mile · Client site",
      "Acme",
      8.61,
    ]);
    expect(sheet?.getCell("E4").value).toMatchObject({ formula: "SUM(E2:E3)", result: 20.61 });
    const summary = read.getWorksheet("Summary");
    const labels: string[] = [];
    summary?.eachRow((r) => {
      labels.push(String(r.getCell(1).value));
    });
    expect(labels).toContain("Total expenses (2)");
    expect(labels).toContain("Net estimate (received minus expenses, not tax advice)");
  });

  it("leaves the file as it was when expenses are not shown", async () => {
    const report = buildAnnualReport({ year: 2026, entries: [], projects: [], invoices: [] });
    const wb = await buildAnnualWorkbook(report, { name: null, ein: null });
    expect(wb.worksheets.map((s) => s.name)).not.toContain("Expenses");
  });
});
