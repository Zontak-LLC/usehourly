import type { Workbook } from "exceljs";

import { categoryLabel, describeTrip, netCents, summarizeExpenses } from "./expenses";

/** One expense as the Year summary's Excel file needs it. */
export type ExpenseSheetRow = {
  date: string;
  kind: string;
  category: string;
  amount_cents: number;
  note: string | null;
  distance: number | null;
  distance_unit: string | null;
  mileage_rate: number | null;
  client: { name: string } | null;
};

const dollars = (c: number) => c / 100;

/**
 * Adds the "Expenses" sheet (one row per expense, oldest first, with a live SUM) and the expense lines of the Summary
 * sheet (total by category and the net estimate). Rows must already be the year's and the report's currency.
 */
export function addExpenseSheets(
  wb: Workbook,
  rows: ExpenseSheetRow[],
  opts: { year: number; receivedCents: number; money: string },
) {
  const summary = summarizeExpenses(rows, opts.year);
  const sum = wb.getWorksheet("Summary");
  if (sum) {
    sum.addRow([]);
    sum.addRow(["Expenses", "Amount"]).font = { bold: true };
    for (const c of summary.byCategory) sum.addRow([c.label, dollars(c.cents)]).getCell(2).numFmt = opts.money;
    const total = sum.addRow([`Total expenses (${summary.count})`, dollars(summary.totalCents)]);
    total.font = { bold: true };
    total.getCell(2).numFmt = opts.money;
    const net = sum.addRow([
      "Net estimate (received minus expenses, not tax advice)",
      dollars(netCents(opts.receivedCents, summary.totalCents)),
    ]);
    net.getCell(2).numFmt = opts.money;
  }

  const sheet = wb.addWorksheet("Expenses", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(["Date", "Category", "Details", "Client", "Amount"]).font = { bold: true };
  const sorted = [...rows]
    .filter((r) => r.date.startsWith(`${opts.year}-`))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const r of sorted) {
    const trip =
      r.kind === "mileage" && r.distance && r.mileage_rate
        ? describeTrip(r.distance, r.distance_unit ?? "mi", r.mileage_rate)
        : "";
    const details = [trip, r.note ?? ""].filter(Boolean).join(" · ");
    const row = sheet.addRow([
      r.date,
      categoryLabel(r.category),
      details,
      r.client?.name ?? "",
      dollars(r.amount_cents),
    ]);
    row.getCell(5).numFmt = opts.money;
  }
  if (sorted.length) {
    const t = sheet.addRow([
      "Total",
      "",
      "",
      "",
      { formula: `SUM(E2:E${sorted.length + 1})`, result: dollars(summary.totalCents) },
    ]);
    t.font = { bold: true };
    t.getCell(5).numFmt = opts.money;
  }
  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 26;
  sheet.getColumn(3).width = 44;
  sheet.getColumn(4).width = 22;
  sheet.getColumn(5).width = 14;
}
