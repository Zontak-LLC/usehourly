import { fromISODate } from "@/lib/dates";
import { WEEKLY_AFTER_WORKED_DAYS, weekStart } from "@/lib/export-range";
import { amountCents } from "@/lib/invoice";
import { effectiveCurrency } from "@/lib/money";
import { buildSheet, exportableEntries, type SheetEntry } from "@/lib/timesheet";

const dayHeader = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });
// A range can cross months, where "Tue 3" is ambiguous (March 3rd or April 3rd), so it carries the month.
const dayHeaderWithMonth = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const weekHeader = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

type Column = { label: string; dates: string[] };

/** 1-based column index → Excel letters (1 → A, 27 → AA). */
function colLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/**
 * Build and download an .xlsx timesheet. Runs in the browser: exceljs is imported on
 * demand so it never enters the main bundle or the Worker.
 *
 * Sheet 1 "Timesheet": project × day grid in decimal hours with live SUM formulas
 * (only days with time logged).
 * Sheet 2 "Entries": one row per entry with hours, rate and billable amount.
 */
export async function buildTimesheetWorkbook(opts: {
  entries: SheetEntry[];
  days: string[];
  /**
   * For a custom date range: headers carry the month, and a long range switches the grid to one
   * column per week ("Week of Mar 2"). Without it the grid is exactly as before (one column per
   * worked day, "Mon 5").
   */
  range?: boolean;
  /** The account's currency: entries of clients without a currency of their own are written in it. */
  accountCurrency?: string;
}) {
  const { default: ExcelJS } = await import("exceljs");
  // Leave out zero-hour entries, and any day with no logged time (weekends, days off), so the
  // grid and the entry list only show days that were actually worked. If nothing was logged at
  // all, keep the requested days so the empty grid still has columns.
  // Days marked non-billable are left out too, so nothing in the file can be mistaken for billable time.
  const entries = exportableEntries(opts.entries);
  const worked = new Set(entries.map((e) => e.date));
  const workedDays = opts.days.filter((d) => worked.has(d));
  const days = workedDays.length > 0 ? workedDays : opts.days;
  const sheet = buildSheet(entries);

  // Columns: normally one per day. A long custom range collapses to one per (Monday-start) week.
  const weekly = Boolean(opts.range) && days.length > WEEKLY_AFTER_WORKED_DAYS;
  const columns: Column[] = [];
  if (weekly) {
    const byWeek = new Map<string, string[]>();
    for (const d of days) {
      const w = weekStart(d);
      byWeek.set(w, [...(byWeek.get(w) ?? []), d]);
    }
    for (const [w, dates] of byWeek) {
      columns.push({ label: `Week of ${weekHeader.format(fromISODate(w))}`, dates });
    }
  } else {
    const header = opts.range ? dayHeaderWithMonth : dayHeader;
    for (const d of days) columns.push({ label: header.format(fromISODate(d)), dates: [d] });
  }
  const colMinutes = (cells: Record<string, { minutes: number }>, c: Column) =>
    c.dates.reduce((a, d) => a + (cells[d]?.minutes ?? 0), 0);
  // Hours are written unrounded (minutes / 60); the "0.00" format shows two decimals. Rounding each
  // cell first made 3 × 20 min add up to 0.99 h while the invoice said 1.00 h (issue 450).

  const wb = new ExcelJS.Workbook();
  wb.creator = "UseHourly";
  wb.created = new Date();

  // ── Timesheet grid ──────────────────────────────────────────────
  const ws = wb.addWorksheet("Timesheet", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  const firstDayCol = 3;
  const totalCol = firstDayCol + columns.length;
  ws.addRow(["Client", "Project", ...columns.map((c) => c.label), "Total (h)"]);

  sheet.rows.forEach((r, i) => {
    const rowNum = i + 2;
    const row = ws.addRow([
      r.client,
      r.project,
      ...columns.map((c) => {
        const m = colMinutes(r.cells, c);
        return m ? m / 60 : null;
      }),
      {
        formula: `SUM(${colLetter(firstDayCol)}${rowNum}:${colLetter(totalCol - 1)}${rowNum})`,
        result: r.total / 60,
      },
    ]);
    row.getCell(totalCol).font = { bold: true };
  });

  const last = sheet.rows.length + 1;
  const totals = ws.addRow([
    "Total",
    "",
    ...columns.map((col, i) => {
      const c = colLetter(firstDayCol + i);
      const m = col.dates.reduce((a, d) => a + (sheet.dayTotals[d] ?? 0), 0);
      return sheet.rows.length ? { formula: `SUM(${c}2:${c}${last})`, result: m / 60 } : 0;
    }),
    sheet.rows.length
      ? { formula: `SUM(${colLetter(totalCol)}2:${colLetter(totalCol)}${last})`, result: sheet.total / 60 }
      : 0,
  ]);
  totals.font = { bold: true };
  totals.border = { top: { style: "thin" } };
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).border = { bottom: { style: "thin" } };
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 26;
  for (let c = firstDayCol; c <= totalCol; c++) {
    ws.getColumn(c).width = c === totalCol ? 11 : 8;
    ws.getColumn(c).numFmt = "0.00";
    ws.getColumn(c).alignment = { horizontal: "right" };
  }
  ws.getRow(1).alignment = { horizontal: "center" };

  // ── Entries detail ──────────────────────────────────────────────
  const es = wb.addWorksheet("Entries", { views: [{ state: "frozen", ySplit: 1 }] });
  es.addRow(["Date", "Client", "Project", "Note", "Hours", "Billable", "Rate (per hour)", "Amount", "Currency"]);
  const sorted = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.project.client.name.localeCompare(b.project.client.name),
  );
  sorted.forEach((e, i) => {
    const n = i + 2;
    const rate = e.project.hourly_rate / 100;
    es.addRow([
      fromISODate(e.date),
      e.project.client.name,
      e.project.name,
      e.note,
      e.minutes / 60,
      e.project.billable ? "Yes" : "No",
      rate || null,
      e.project.billable && rate
        ? { formula: `E${n}*G${n}`, result: amountCents(e.minutes, e.project.hourly_rate) / 100 }
        : null,
      effectiveCurrency(e.project.client.currency, opts.accountCurrency),
    ]);
  });
  // Amounts in different currencies are never added together: the total is left out when the entries mix them.
  const oneCurrency =
    new Set(sorted.map((e) => effectiveCurrency(e.project.client.currency, opts.accountCurrency))).size <= 1;
  const amountTotalCents = sorted.reduce(
    (a, e) => a + (e.project.billable ? amountCents(e.minutes, e.project.hourly_rate) : 0),
    0,
  );
  if (sorted.length) {
    const t = es.addRow([
      "Total",
      "",
      "",
      "",
      { formula: `SUM(E2:E${sorted.length + 1})`, result: sheet.total / 60 },
      "",
      "",
      oneCurrency ? { formula: `SUM(H2:H${sorted.length + 1})`, result: amountTotalCents / 100 } : "",
    ]);
    t.font = { bold: true };
    t.border = { top: { style: "thin" } };
  }
  es.getRow(1).font = { bold: true };
  es.getColumn(1).numFmt = "yyyy-mm-dd";
  es.getColumn(1).width = 12;
  es.getColumn(2).width = 22;
  es.getColumn(3).width = 26;
  es.getColumn(4).width = 44;
  es.getColumn(5).numFmt = "0.00";
  es.getColumn(7).numFmt = "#,##0.00";
  es.getColumn(8).numFmt = "#,##0.00";

  return wb;
}

/** Browser-only: build the workbook and trigger a file download. */
export async function downloadTimesheetXlsx(opts: {
  entries: SheetEntry[];
  days: string[];
  filename: string;
  range?: boolean;
  accountCurrency?: string;
}) {
  const wb = await buildTimesheetWorkbook(opts);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
