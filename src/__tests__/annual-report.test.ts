import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import { buildAnnualReport, type ReportEntry, type ReportProject } from "@/lib/annual-report";
import { buildAnnualWorkbook } from "@/lib/export-annual-xlsx";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

const projects: ReportProject[] = [
  { id: "web", name: "Website", hourly_rate: 10000, billable: true, client_id: "acme", client_name: "Acme" },
  { id: "app", name: "App", hourly_rate: 12550, billable: true, client_id: "acme", client_name: "Acme" },
  { id: "admin", name: "Admin", hourly_rate: 9000, billable: false, client_id: "self", client_name: "Internal" },
  { id: "old", name: "Old site", hourly_rate: 8000, billable: true, client_id: "globex", client_name: "Globex" },
];

const entries: ReportEntry[] = [
  { date: "2026-01-12", minutes: 90, project_id: "web" }, // Q1
  { date: "2026-01-12", minutes: 30, project_id: "web" }, // same day, same project
  { date: "2026-02-03", minutes: 100, project_id: "app" }, // 1h40 @ $125.50 = $209.17
  { date: "2026-04-20", minutes: 600, project_id: "web" }, // Q2
  { date: "2026-04-21", minutes: 120, project_id: "admin" }, // non-billable
  { date: "2026-12-31", minutes: 60, project_id: "old" }, // archived project, last day of year
  { date: "2025-12-31", minutes: 999, project_id: "web" }, // wrong year: ignored
  { date: "2027-01-01", minutes: 999, project_id: "web" }, // wrong year: ignored
  { date: "2026-05-05", minutes: 45, project_id: "ghost" }, // unknown project: ignored
];

const invoices = [
  {
    number: "INV-2026-002",
    client_name: "Acme",
    issue_date: "2026-06-30",
    paid_date: null,
    total_cents: 50000,
    total_minutes: 300,
  },
  {
    number: "INV-2026-001",
    client_name: "Acme",
    issue_date: "2026-03-31",
    paid_date: "2026-04-10",
    total_cents: 20000,
    total_minutes: 120,
  },
  // Issued last year, paid this year: cash received in 2026, not 2026 invoicing.
  {
    number: "INV-2025-009",
    client_name: "Acme",
    issue_date: "2025-12-15",
    paid_date: "2026-01-05",
    total_cents: 99999,
    total_minutes: 1,
  },
  // Issued and paid in 2025: belongs to neither side of 2026.
  {
    number: "INV-2025-001",
    client_name: "Acme",
    issue_date: "2025-03-01",
    paid_date: "2025-03-20",
    total_cents: 7777,
    total_minutes: 1,
  },
];

describe("annual report numbers", () => {
  const r = buildAnnualReport({ year: 2026, entries, projects, invoices });

  it("totals hours, splits billable from non-billable, and ignores other years and unknown projects", () => {
    // 120 + 100 + 600 + 120 + 60
    expect(r.totals.minutes).toBe(1000);
    expect(r.totals.nonBillableMinutes).toBe(120);
    expect(r.totals.billableMinutes).toBe(880);
    expect(r.totals.entryCount).toBe(6);
    expect(r.totals.workedDays).toBe(5); // the two Jan-12 entries are one day
  });

  it("earned = billable hours × rate, rounded per project-month, and every view agrees", () => {
    // web Jan 2h = $200, web Apr 10h = $1000, app Feb $209.17, old Dec 1h = $80 → $1489.17
    expect(r.totals.earnedCents).toBe(20000 + 100000 + 20917 + 8000);
    expect(r.months.reduce((a, m) => a + m.earnedCents, 0)).toBe(r.totals.earnedCents);
    expect(r.quarters.reduce((a, q) => a + q.earnedCents, 0)).toBe(r.totals.earnedCents);
    expect(r.projects.reduce((a, p) => a + p.earnedCents, 0)).toBe(r.totals.earnedCents);
    expect(r.clients.reduce((a, c) => a + c.earnedCents, 0)).toBe(r.totals.earnedCents);
  });

  it("buckets months and quarters correctly, including the year's last day", () => {
    expect(r.months).toHaveLength(12);
    expect(r.months[0]).toMatchObject({ month: 1, minutes: 120, earnedCents: 20000 });
    expect(r.months[11]).toMatchObject({ month: 12, minutes: 60, earnedCents: 8000 });
    expect(r.quarters.map((q) => q.minutes)).toEqual([220, 720, 0, 60]);
    expect(r.quarters[1]).toMatchObject({ billableMinutes: 600, earnedCents: 100000 }); // Q2: admin excluded
  });

  it("ranks projects and clients by earnings, and non-billable work earns nothing", () => {
    expect(r.projects.map((p) => p.project)).toEqual(["Website", "App", "Old site", "Admin"]);
    expect(r.projects.find((p) => p.projectId === "admin")).toMatchObject({
      minutes: 120,
      earnedCents: 0,
      billable: false,
    });
    expect(r.clients.map((c) => c.client)).toEqual(["Acme", "Globex", "Internal"]);
    expect(r.clients[0]).toMatchObject({ projects: 2, minutes: 820 });
  });

  it("lists only invoices issued in the year, oldest first, with their total", () => {
    expect(r.invoices.count).toBe(2);
    expect(r.invoices.list.map((i) => i.number)).toEqual(["INV-2026-001", "INV-2026-002"]);
    expect(r.invoices.totalCents).toBe(70000);
  });

  it("cash view: payments are counted in the year the money arrived, by month and quarter", () => {
    expect(r.received.count).toBe(2);
    expect(r.received.totalCents).toBe(99999 + 20000);
    expect(r.received.list.map((i) => i.number)).toEqual(["INV-2025-009", "INV-2026-001"]); // by paid date
    expect(r.months[0].receivedCents).toBe(99999); // Jan: the 2025 invoice paid 2026-01-05
    expect(r.months[3].receivedCents).toBe(20000); // Apr
    expect(r.quarters.map((q) => q.receivedCents)).toEqual([99999, 20000, 0, 0]);
    expect(r.quarters.reduce((a, q) => a + q.receivedCents, 0)).toBe(r.received.totalCents);
  });

  it("outstanding = issued this year and still unpaid at year end", () => {
    expect(r.outstanding).toEqual({ count: 1, totalCents: 50000 });
    // Paid only in the following year still counts as outstanding at this year's end.
    const late = buildAnnualReport({
      year: 2026,
      entries: [],
      projects,
      invoices: [{ ...invoices[0], paid_date: "2027-02-01" }],
    });
    expect(late.outstanding).toEqual({ count: 1, totalCents: 50000 });
    expect(late.received.count).toBe(0);
  });

  it("an empty year is all zeros, not an error", () => {
    const empty = buildAnnualReport({ year: 2030, entries: [], projects, invoices: [] });
    expect(empty.totals).toMatchObject({ minutes: 0, earnedCents: 0, entryCount: 0, workedDays: 0 });
    expect(empty.months).toHaveLength(12);
    expect(empty.invoices).toEqual({ count: 0, totalCents: 0, list: [] });
    expect(empty.received).toEqual({ count: 0, totalCents: 0, list: [] });
    expect(empty.outstanding).toEqual({ count: 0, totalCents: 0 });
  });
});

describe("annual report procedure", () => {
  function setup() {
    const prisma = {
      timeEntry: { findMany: vi.fn(async () => entries.filter((e) => e.date.startsWith("2026"))) },
      project: {
        findMany: vi.fn(async () =>
          projects.map((p) => ({
            id: p.id,
            name: p.name,
            hourly_rate: p.hourly_rate,
            billable: p.billable,
            client: { id: p.client_id, name: p.client_name },
          })),
        ),
      },
      invoice: {
        findMany: vi.fn(async () =>
          invoices.filter((i) => i.issue_date.startsWith("2026") || i.paid_date?.startsWith("2026")),
        ),
      },
    };
    const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
    return { prisma, caller };
  }

  it("scopes every query to the caller and the calendar year", async () => {
    const { prisma, caller } = setup();
    const r = await caller.report.annual({ year: 2026 });
    expect(r.totals.earnedCents).toBe(148917);
    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: "u1", date: { gte: "2026-01-01", lte: "2026-12-31" } } }),
    );
    expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: "u1" } }));
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: "u1",
          OR: [
            { issue_date: { gte: "2026-01-01", lte: "2026-12-31" } },
            { paid_date: { gte: "2026-01-01", lte: "2026-12-31" } },
          ],
        },
      }),
    );
  });

  it("rejects signed-out callers and nonsense years without touching the database", async () => {
    const { prisma, caller } = setup();
    const anon = createCaller({ session: null, prisma: prisma as never });
    await expect(anon.report.annual({ year: 2026 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.report.annual({ year: 1850 })).rejects.toThrow();
    await expect(caller.report.annual({ year: 2026.5 })).rejects.toThrow();
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
  });
});

describe("annual report Excel export", () => {
  it("writes real sheets whose figures and SUM formulas match the report", async () => {
    const report = buildAnnualReport({ year: 2026, entries, projects, invoices });
    const wb = await buildAnnualWorkbook(report, { name: "Jo Design LLC", ein: "12-3456789" });
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(await wb.xlsx.writeBuffer());
    expect(read.worksheets.map((w) => w.name)).toEqual([
      "Summary",
      "Monthly",
      "Clients & projects",
      "Invoices",
      "Payments received",
    ]);

    const summary = read.getWorksheet("Summary");
    expect(summary?.getCell("A1").value).toBe("Annual summary 2026");
    expect(summary?.getCell("B2").value).toBe("Jo Design LLC");
    expect(summary?.getCell("B3").value).toBe("12-3456789");

    const monthly = read.getWorksheet("Monthly");
    expect(monthly?.getRow(2).getCell(1).value).toBe("January");
    expect(monthly?.getRow(2).getCell(4).value).toBe(200); // Jan earned $200.00
    expect(monthly?.getRow(14).getCell(2).value).toMatchObject({ formula: "SUM(B2:B13)", result: 16.67 });
    expect(monthly?.getRow(14).getCell(4).value).toMatchObject({ formula: "SUM(D2:D13)", result: 1489.17 });

    const invs = read.getWorksheet("Invoices");
    expect(invs?.rowCount).toBe(4); // header + 2 invoices issued in 2026 + total
    expect(invs?.getRow(4).getCell(5).value).toMatchObject({ result: 700 });
    expect(invs?.getRow(1).getCell(6).value).toBe("Paid on");
    expect(invs?.getRow(2).getCell(6).value).toBe("2026-04-10"); // INV-2026-001
    expect(invs?.getRow(3).getCell(6).value).toBe("Unpaid"); // INV-2026-002

    const pay = read.getWorksheet("Payments received");
    expect(pay?.rowCount).toBe(4); // header + 2 payments + total
    expect(pay?.getRow(2).getCell(1).value).toBe("INV-2025-009"); // paid 2026-01-05, issued 2025
    expect(pay?.getRow(4).getCell(5).value).toMatchObject({ result: 1199.99 });

    const monthly2 = read.getWorksheet("Monthly");
    expect(monthly2?.getRow(1).getCell(5).value).toBe("Received");
    expect(monthly2?.getRow(2).getCell(5).value).toBe(999.99); // January payment
  });
});
