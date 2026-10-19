import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import { planExport } from "@/lib/export-all";
import { buildTimesheetWorkbook } from "@/lib/export-xlsx";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryInvoiceLogos } from "./helpers/memory-invoice-logos";
import { memoryNonBillableDays } from "./helpers/memory-non-billable";

const createCaller = createCallerFactory(appRouter);

const project = { id: "p1", name: "Website", hourly_rate: 10000, billable: true, client_id: "c1" };
const withProject = {
  ...project,
  client: { id: "c1", name: "Acme", color: "#10b981" },
};

type Entry = { id: string; user_id: string; date: string; minutes: number; note: string };
const entry = (id: string, user_id: string, date: string, minutes: number, note: string): Entry => ({
  id,
  user_id,
  date,
  minutes,
  note,
});

/** Jo's week, and a stranger's entry on the very same date (it must never be touched or flagged). */
const ENTRIES: Entry[] = [
  entry("e1", "u1", "2026-10-02", 90, "homepage hero"),
  entry("e2", "u1", "2026-10-03", 45, "nav fixes"),
  entry("e3", "u1", "2026-10-03", 30, "footer links"),
  entry("e4", "u1", "2026-10-05", 60, "contact form"),
  entry("x1", "u2", "2026-10-03", 500, "someone else's day"),
];

const user = {
  id: "u1",
  name: "Jo Freelance",
  email: "jo@example.com",
  business_name: "Jo Design LLC",
  ein: "12-3456789",
  address: "1 Main St",
  logo: null,
  payment_instructions: "Pay by ACH",
};

function world(initialDays: { user_id: string; date: string }[] = []) {
  const days = memoryNonBillableDays(initialDays);
  const prisma = {
    ...days,
    ...memoryInvoiceLogos(),
    timeEntry: {
      count: vi.fn(async () => ENTRIES.length),
      findMany: vi.fn(async ({ where }: { where: { user_id: string; date?: { gte: string; lte: string } } }) =>
        ENTRIES.filter(
          (e) => e.user_id === where.user_id && (!where.date || (e.date >= where.date.gte && e.date <= where.date.lte)),
        ).map((e) => ({ ...e, project_id: "p1", started_at: null, project: withProject })),
      ),
    },
    client: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => ({ id: "c1", name: "Acme", legal_name: null, address: null, logo: null })),
    },
    project: { findMany: vi.fn(async () => [{ ...project, client: { id: "c1", name: "Acme" } }]) },
    invoice: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (_args: { data: Record<string, string> }) => ({ id: "inv1" })),
      count: vi.fn(async () => 0),
    },
    authUser: { findUnique: vi.fn(async () => user) },
  };
  const as = (id: string | null, demo = false) =>
    createCaller({
      session: id ? ({ user: { id, ...(demo ? { demo: true } : {}) }, expires: "" } as never) : null,
      prisma: prisma as never,
    });
  return { prisma, as, rows: days.nonBillableRows };
}

const RANGE = { from: "2026-10-01", to: "2026-10-31" };
const invoiceInput = {
  clientId: "c1",
  ...RANGE,
  number: "INV-2026-001",
  issueDate: "2026-10-31",
  dueDate: "2026-11-30",
  notes: "",
  includeDetail: true,
};

describe("marking a day non-billable", () => {
  it("flags only that day's entries, lists the day, and storing it twice changes nothing", async () => {
    const { prisma, as, rows } = world();
    const jo = as("u1");

    expect((await jo.entry.list(RANGE)).every((e) => e.non_billable === false)).toBe(true);
    expect(await jo.entry.nonBillableDays(RANGE)).toEqual([]);

    expect(await jo.entry.setNonBillable({ date: "2026-10-03", nonBillable: true })).toEqual({
      date: "2026-10-03",
      nonBillable: true,
    });
    await jo.entry.setNonBillable({ date: "2026-10-03", nonBillable: true });

    expect(rows).toEqual([{ user_id: "u1", date: "2026-10-03" }]);
    expect(prisma.nonBillableDay.create).toHaveBeenCalledTimes(1);
    expect(await jo.entry.nonBillableDays(RANGE)).toEqual(["2026-10-03"]);

    const flagged = (await jo.entry.list(RANGE)).map((e) => [e.id, e.non_billable]);
    expect(flagged).toEqual(
      expect.arrayContaining([
        ["e1", false],
        ["e2", true],
        ["e3", true],
        ["e4", false],
      ]),
    );
    // a day outside the asked range is not reported
    expect(await jo.entry.nonBillableDays({ from: "2026-10-04", to: "2026-10-31" })).toEqual([]);
  });

  it("can be undone, and works for a day that has no entries yet", async () => {
    const { as, rows } = world();
    const jo = as("u1");
    await jo.entry.setNonBillable({ date: "2026-10-10", nonBillable: true }); // no entries that day
    expect(await jo.entry.nonBillableDays(RANGE)).toEqual(["2026-10-10"]);
    await jo.entry.setNonBillable({ date: "2026-10-10", nonBillable: false });
    await jo.entry.setNonBillable({ date: "2026-10-10", nonBillable: false }); // undoing twice is fine too
    expect(rows).toEqual([]);
    expect(await jo.entry.nonBillableDays(RANGE)).toEqual([]);
  });

  it("keeps the day's time off the invoice, and refuses an invoice when every day is marked", async () => {
    const { prisma, as } = world([{ user_id: "u1", date: "2026-10-03" }]);
    const jo = as("u1");

    const { snapshot } = await jo.invoice.create(invoiceInput);
    // 90 + 60 minutes at $100/h = $250; the 75 minutes on Oct 3 are not billed
    expect(snapshot.lines).toEqual([
      { projectId: "p1", project: "Website", minutes: 150, rateCents: 10000, amountCents: 25000 },
    ]);
    expect(snapshot.detail.map((d) => d.note)).toEqual(["homepage hero", "contact form"]);
    expect(prisma.invoice.create.mock.calls[0][0].data).toMatchObject({ total_cents: 25000, total_minutes: 150 });

    // marking the rest of the month's working days leaves nothing to bill
    await jo.entry.setNonBillable({ date: "2026-10-02", nonBillable: true });
    await jo.entry.setNonBillable({ date: "2026-10-05", nonBillable: true });
    prisma.invoice.create.mockClear();
    await expect(jo.invoice.create({ ...invoiceInput, number: "INV-2026-002" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("No billable time"),
    });
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("leaves the day out of the year summary", async () => {
    const { as } = world([{ user_id: "u1", date: "2026-10-03" }]);
    const jo = as("u1");
    const report = await jo.report.annual({ year: 2026 });
    // 90 + 60 minutes = 2.5 h; the 75 minutes on the marked day do not count, nor does the stranger's 500
    expect(report.totals.minutes).toBe(150);
    expect(report.totals.entryCount).toBe(2);
    expect(report.totals.workedDays).toBe(2);
    expect(report.totals.earnedCents).toBe(25000);
  });

  it("leaves the day out of every export, and the zip says how many entries it left out", async () => {
    const { as } = world([{ user_id: "u1", date: "2026-10-03" }]);
    const listed = await as("u1").entry.list(RANGE);

    const plan = await planExport({ entries: listed, invoices: [], today: "2026-10-31" });
    const csv = String(plan.files.find((f) => f.path === "all-entries.csv")?.content);
    expect(csv).toContain("homepage hero");
    expect(csv).toContain("contact form");
    expect(csv).not.toContain("nav fixes");
    expect(csv).not.toContain("footer links");
    expect(plan.entryCount).toBe(2);
    expect(plan.totalMinutes).toBe(150);
    expect(String(plan.files.find((f) => f.path === "README.txt")?.content)).toContain(
      "2 entries on days marked non-billable were left out.",
    );

    // the week/month/range workbook: no row and no column for the marked day
    const wb = await buildTimesheetWorkbook({ entries: listed, days: ["2026-10-02", "2026-10-03", "2026-10-05"] });
    const buf = await wb.xlsx.writeBuffer();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buf as ArrayBuffer);
    const notes: string[] = [];
    book.getWorksheet("Entries")?.eachRow((row) => {
      for (const v of row.values as unknown[]) if (typeof v === "string") notes.push(v);
    });
    expect(notes).toEqual(expect.arrayContaining(["homepage hero", "contact form"]));
    expect(notes).not.toContain("nav fixes");
    const timesheet = book.getWorksheet("Timesheet");
    expect(timesheet).toBeDefined();
    const header = ((timesheet?.getRow(1).values ?? []) as unknown[]).slice(1).map(String);
    expect(header.length).toBeGreaterThan(2); // the grid really has columns, so the check below means something
    expect(header.filter((h) => /\b3\b/.test(h))).toEqual([]);

    // with nothing marked, the same export keeps all four of Jo's entries and adds no note
    const clean = await planExport({
      entries: (await world().as("u1").entry.list(RANGE)) as never,
      invoices: [],
      today: "2026-10-31",
    });
    expect(clean.entryCount).toBe(4);
    expect(String(clean.files.find((f) => f.path === "README.txt")?.content)).not.toContain("non-billable");
  });

  it("never lets one account see or change another's marked days", async () => {
    const { as, rows } = world([{ user_id: "u2", date: "2026-10-03" }]);
    const jo = as("u1");
    expect(await jo.entry.nonBillableDays(RANGE)).toEqual([]);
    expect((await jo.entry.list(RANGE)).some((e) => e.non_billable)).toBe(false);

    await jo.entry.setNonBillable({ date: "2026-10-03", nonBillable: true });
    await jo.entry.setNonBillable({ date: "2026-10-03", nonBillable: false });
    // Jo's own un-marking left the stranger's row alone
    expect(rows).toEqual([{ user_id: "u2", date: "2026-10-03" }]);
    expect(await as("u2").entry.nonBillableDays(RANGE)).toEqual(["2026-10-03"]);
  });

  it("refuses impossible dates, wrong types and signed-out callers, and writes nothing", async () => {
    const { prisma, as } = world();
    const jo = as("u1");
    for (const bad of [
      { date: "2026-02-30", nonBillable: true },
      { date: "10/03/2026", nonBillable: true },
      { date: "2026-10-03", nonBillable: "yes" },
      { date: "2026-10-03" },
    ]) {
      await expect(jo.entry.setNonBillable(bad as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(as(null).entry.setNonBillable({ date: "2026-10-03", nonBillable: true })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(as(null).entry.nonBillableDays(RANGE)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(jo.entry.nonBillableDays({ from: "2026-12-31", to: "2026-01-01" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(prisma.nonBillableDay.create).not.toHaveBeenCalled();
    expect(prisma.nonBillableDay.deleteMany).not.toHaveBeenCalled();
  });

  it("limits how many days an account can mark, and a demo account far fewer", async () => {
    const full = Array.from({ length: 60 }, (_, i) => ({
      user_id: "u1",
      date: `2025-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
    }));
    const { prisma, as } = world(full);
    await expect(as("u1", true).entry.setNonBillable({ date: "2026-10-03", nonBillable: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(prisma.nonBillableDay.create).not.toHaveBeenCalled();
    // a real account is fine with the same number
    await as("u1").entry.setNonBillable({ date: "2026-10-03", nonBillable: true });
    expect(prisma.nonBillableDay.create).toHaveBeenCalledTimes(1);
  });
});
