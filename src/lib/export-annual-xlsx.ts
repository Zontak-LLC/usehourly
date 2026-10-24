import type { AnnualReport } from "@/lib/annual-report";

import { addExpenseSheets, type ExpenseSheetRow } from "./expenses-xlsx";
import { excelMoneyFormat } from "./money";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const hours = (m: number) => Math.round((m / 60) * 100) / 100;
const dollars = (c: number) => c / 100;

export type ReportBusiness = { name: string | null; ein: string | null; currency?: string };

/**
 * Build the annual-report workbook. exceljs is imported on demand so it stays out of the main
 * bundle. Sheets: Summary (totals + quarters), Monthly, Clients & projects, Invoices — with live
 * SUM formulas so edits in Excel keep the totals honest.
 */
export async function buildAnnualWorkbook(
  report: AnnualReport,
  business: ReportBusiness,
  expenses?: ExpenseSheetRow[],
) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "UseHourly";
  wb.created = new Date();
  const money = excelMoneyFormat(business.currency);

  // ── Summary ───────────────────────────────────────────────────────
  const sum = wb.addWorksheet("Summary");
  sum.addRow([`Annual summary ${report.year}`]).font = { bold: true, size: 14 };
  if (business.name) sum.addRow(["Business", business.name]);
  if (business.ein) sum.addRow(["EIN", business.ein]);
  sum.addRow([]);
  const t = report.totals;
  const rows: [string, number | string, string?][] = [
    ["Total hours worked", hours(t.minutes), "0.00"],
    ["Billable hours", hours(t.billableMinutes), "0.00"],
    ["Non-billable hours", hours(t.nonBillableMinutes), "0.00"],
    ["Days with time logged", t.workedDays, "0"],
    ["Earned (billable hours × project rate)", dollars(t.earnedCents), money],
    [
      `Invoiced (${report.invoices.count} invoice${report.invoices.count === 1 ? "" : "s"} issued in ${report.year})`,
      dollars(report.invoices.totalCents),
      money,
    ],
    [
      `Received (${report.received.count} payment${report.received.count === 1 ? "" : "s"} in ${report.year})`,
      dollars(report.received.totalCents),
      money,
    ],
    [
      `Outstanding at year end (${report.outstanding.count} invoice${report.outstanding.count === 1 ? "" : "s"})`,
      dollars(report.outstanding.totalCents),
      money,
    ],
  ];
  for (const [label, value, fmt] of rows) {
    const r = sum.addRow([label, value]);
    if (fmt) r.getCell(2).numFmt = fmt;
  }
  sum.addRow([]);
  const qh = sum.addRow(["Quarter", "Hours", "Billable hours", "Earned", "Received"]);
  qh.font = { bold: true };
  report.quarters.forEach((q) => {
    const r = sum.addRow([
      `Q${q.quarter}`,
      hours(q.minutes),
      hours(q.billableMinutes),
      dollars(q.earnedCents),
      dollars(q.receivedCents),
    ]);
    r.getCell(2).numFmt = "0.00";
    r.getCell(3).numFmt = "0.00";
    r.getCell(4).numFmt = money;
    r.getCell(5).numFmt = money;
  });
  sum.addRow([]);
  sum.addRow([
    "Earned is billable hours × each project's current hourly rate: what the time is worth. Received is the invoices you marked as paid, by the date they were paid — use it for cash-basis reporting and check it against your bank deposits. This is a summary of your own records, not tax advice.",
  ]);
  sum.getColumn(1).width = 52;
  for (const c of [2, 3, 4, 5]) sum.getColumn(c).width = 16;
  sum.getCell("A1").alignment = { vertical: "top" };

  // ── Monthly ───────────────────────────────────────────────────────
  const mon = wb.addWorksheet("Monthly", { views: [{ state: "frozen", ySplit: 1 }] });
  mon.addRow(["Month", "Hours", "Billable hours", "Earned", "Received"]).font = { bold: true };
  report.months.forEach((m, i) => {
    const r = mon.addRow([
      MONTH_NAMES[i],
      hours(m.minutes),
      hours(m.billableMinutes),
      dollars(m.earnedCents),
      dollars(m.receivedCents),
    ]);
    r.getCell(2).numFmt = "0.00";
    r.getCell(3).numFmt = "0.00";
    r.getCell(4).numFmt = money;
    r.getCell(5).numFmt = money;
  });
  const mt = mon.addRow([
    "Total",
    { formula: "SUM(B2:B13)", result: hours(t.minutes) },
    { formula: "SUM(C2:C13)", result: hours(t.billableMinutes) },
    { formula: "SUM(D2:D13)", result: dollars(t.earnedCents) },
    { formula: "SUM(E2:E13)", result: dollars(report.received.totalCents) },
  ]);
  mt.font = { bold: true };
  mt.getCell(2).numFmt = "0.00";
  mt.getCell(3).numFmt = "0.00";
  mt.getCell(4).numFmt = money;
  mt.getCell(5).numFmt = money;
  mon.getColumn(1).width = 16;
  for (const c of [2, 3, 4, 5]) mon.getColumn(c).width = 16;

  // ── Clients & projects ────────────────────────────────────────────
  const cp = wb.addWorksheet("Clients & projects", { views: [{ state: "frozen", ySplit: 1 }] });
  cp.addRow(["Client", "Project", "Billable", "Rate ($/h)", "Hours", "Billable hours", "Earned"]).font = { bold: true };
  const projects = [...report.projects].sort(
    (a, b) => a.client.localeCompare(b.client) || a.project.localeCompare(b.project),
  );
  projects.forEach((p) => {
    const r = cp.addRow([
      p.client,
      p.project,
      p.billable ? "Yes" : "No",
      p.billable ? dollars(p.rateCents) : null,
      hours(p.minutes),
      hours(p.billableMinutes),
      dollars(p.earnedCents),
    ]);
    r.getCell(4).numFmt = money;
    r.getCell(5).numFmt = "0.00";
    r.getCell(6).numFmt = "0.00";
    r.getCell(7).numFmt = money;
  });
  if (projects.length) {
    const last = projects.length + 1;
    const ct = cp.addRow([
      "Total",
      "",
      "",
      "",
      { formula: `SUM(E2:E${last})`, result: hours(t.minutes) },
      { formula: `SUM(F2:F${last})`, result: hours(t.billableMinutes) },
      { formula: `SUM(G2:G${last})`, result: dollars(t.earnedCents) },
    ]);
    ct.font = { bold: true };
    ct.getCell(5).numFmt = "0.00";
    ct.getCell(6).numFmt = "0.00";
    ct.getCell(7).numFmt = money;
  }
  cp.getColumn(1).width = 24;
  cp.getColumn(2).width = 28;
  for (const c of [3, 4, 5, 6, 7]) cp.getColumn(c).width = 15;

  // ── Invoices (issued in the year) ─────────────────────────────────
  const inv = wb.addWorksheet("Invoices", { views: [{ state: "frozen", ySplit: 1 }] });
  inv.addRow(["Invoice #", "Client", "Issued", "Hours", "Total", "Paid on"]).font = { bold: true };
  report.invoices.list.forEach((i) => {
    const r = inv.addRow([
      i.number,
      i.client_name,
      i.issue_date,
      hours(i.total_minutes),
      dollars(i.total_cents),
      i.paid_date ?? "Unpaid",
    ]);
    r.getCell(4).numFmt = "0.00";
    r.getCell(5).numFmt = money;
  });
  if (report.invoices.list.length) {
    const last = report.invoices.list.length + 1;
    const it = inv.addRow([
      "Total",
      "",
      "",
      { formula: `SUM(D2:D${last})`, result: hours(report.invoices.list.reduce((a, i) => a + i.total_minutes, 0)) },
      { formula: `SUM(E2:E${last})`, result: dollars(report.invoices.totalCents) },
    ]);
    it.font = { bold: true };
    it.getCell(4).numFmt = "0.00";
    it.getCell(5).numFmt = money;
  }
  inv.getColumn(1).width = 18;
  inv.getColumn(2).width = 26;
  inv.getColumn(3).width = 14;
  inv.getColumn(4).width = 12;
  inv.getColumn(5).width = 16;
  inv.getColumn(6).width = 14;

  // ── Payments received (cash view: by the date the money arrived) ──
  const pay = wb.addWorksheet("Payments received", { views: [{ state: "frozen", ySplit: 1 }] });
  pay.addRow(["Invoice #", "Client", "Issued", "Paid on", "Amount"]).font = { bold: true };
  report.received.list.forEach((i) => {
    const r = pay.addRow([i.number, i.client_name, i.issue_date, i.paid_date, dollars(i.total_cents)]);
    r.getCell(5).numFmt = money;
  });
  if (report.received.list.length) {
    const last = report.received.list.length + 1;
    const pt = pay.addRow([
      "Total",
      "",
      "",
      "",
      { formula: `SUM(E2:E${last})`, result: dollars(report.received.totalCents) },
    ]);
    pt.font = { bold: true };
    pt.getCell(5).numFmt = money;
  }
  pay.getColumn(1).width = 18;
  pay.getColumn(2).width = 26;
  pay.getColumn(3).width = 14;
  pay.getColumn(4).width = 14;
  pay.getColumn(5).width = 16;

  // ── Expenses (only when the Year summary shows them) ──────────────
  if (expenses) addExpenseSheets(wb, expenses, { year: report.year, receivedCents: report.received.totalCents, money });

  return wb;
}

/** Browser-only: build the workbook and trigger the download. */
export async function downloadAnnualXlsx(report: AnnualReport, business: ReportBusiness, expenses?: ExpenseSheetRow[]) {
  const wb = await buildAnnualWorkbook(report, business, expenses);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `usehourly-annual-report-${report.year}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
