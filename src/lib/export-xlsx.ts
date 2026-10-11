import { fromISODate } from "@/lib/dates";
import { buildSheet, type SheetEntry } from "@/lib/timesheet";

const dayHeader = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });

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
export async function buildTimesheetWorkbook(opts: { entries: SheetEntry[]; days: string[] }) {
  const { default: ExcelJS } = await import("exceljs");
  // Leave out zero-hour entries, and any day with no logged time (weekends, days off), so the
  // grid and the entry list only show days that were actually worked. If nothing was logged at
  // all, keep the requested days so the empty grid still has columns.
  const entries = opts.entries.filter((e) => e.minutes > 0);
  const worked = new Set(entries.map((e) => e.date));
  const workedDays = opts.days.filter((d) => worked.has(d));
  const days = workedDays.length > 0 ? workedDays : opts.days;
  const sheet = buildSheet(entries);
  const hours = (m: number) => Math.round((m / 60) * 100) / 100;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Hourly";
  wb.created = new Date();

  // ── Timesheet grid ──────────────────────────────────────────────
  const ws = wb.addWorksheet("Timesheet", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  const firstDayCol = 3;
  const totalCol = firstDayCol + days.length;
  ws.addRow(["Client", "Project", ...days.map((d) => dayHeader.format(fromISODate(d))), "Total (h)"]);

  sheet.rows.forEach((r, i) => {
    const rowNum = i + 2;
    const row = ws.addRow([
      r.client,
      r.project,
      ...days.map((d) => (r.cells[d]?.minutes ? hours(r.cells[d].minutes) : null)),
      {
        formula: `SUM(${colLetter(firstDayCol)}${rowNum}:${colLetter(totalCol - 1)}${rowNum})`,
        result: hours(r.total),
      },
    ]);
    row.getCell(totalCol).font = { bold: true };
  });

  const last = sheet.rows.length + 1;
  const totals = ws.addRow([
    "Total",
    "",
    ...days.map((d, i) => {
      const c = colLetter(firstDayCol + i);
      return sheet.rows.length ? { formula: `SUM(${c}2:${c}${last})`, result: hours(sheet.dayTotals[d] ?? 0) } : 0;
    }),
    sheet.rows.length
      ? { formula: `SUM(${colLetter(totalCol)}2:${colLetter(totalCol)}${last})`, result: hours(sheet.total) }
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
  es.addRow(["Date", "Client", "Project", "Note", "Hours", "Billable", "Rate ($/h)", "Amount ($)"]);
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
      hours(e.minutes),
      e.project.billable ? "Yes" : "No",
      rate || null,
      e.project.billable && rate ? { formula: `E${n}*G${n}`, result: hours(e.minutes) * rate } : null,
    ]);
  });
  const amountTotal = sorted.reduce(
    (a, e) => a + (e.project.billable ? hours(e.minutes) * (e.project.hourly_rate / 100) : 0),
    0,
  );
  if (sorted.length) {
    const t = es.addRow([
      "Total",
      "",
      "",
      "",
      { formula: `SUM(E2:E${sorted.length + 1})`, result: hours(sheet.total) },
      "",
      "",
      { formula: `SUM(H2:H${sorted.length + 1})`, result: amountTotal },
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
export async function downloadTimesheetXlsx(opts: { entries: SheetEntry[]; days: string[]; filename: string }) {
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
