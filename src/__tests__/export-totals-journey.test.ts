import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildAnnualReport } from "@/lib/annual-report";
import { entriesCsv } from "@/lib/export-all";
import { buildAnnualWorkbook } from "@/lib/export-annual-xlsx";
import { buildTimesheetWorkbook } from "@/lib/export-xlsx";
import { buildInvoice } from "@/lib/invoice";
import type { SheetEntry } from "@/lib/timesheet";

/**
 * Issue 450: three 20-minute entries at $150/h. The invoice says 1.00 h and $150.00; the
 * Excel timesheet and the CSV must say the same, not 0.99 h and $148.50.
 */
const RATE_CENTS = 15000;
const entries: SheetEntry[] = ["2026-03-02", "2026-03-03", "2026-03-04"].map((date, i) => ({
  id: `e${i}`,
  project_id: "p1",
  date,
  minutes: 20,
  note: "",
  started_at: null,
  project: { name: "Website", hourly_rate: RATE_CENTS, billable: true, client: { name: "Acme", color: "#10b981" } },
}));
const days = entries.map((e) => e.date);

const invoiceCents = buildInvoice(entries).totalCents;

/** Write and read back the workbook, as a client opening the file would. */
async function reload(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(await wb.xlsx.writeBuffer());
  return read;
}

function sheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`no sheet ${name}`);
  return ws;
}

function numberAt(ws: ExcelJS.Worksheet, ref: string): number {
  const v = ws.getCell(ref).value;
  if (typeof v === "number") return v;
  if (v === null || v === undefined) return 0;
  if (typeof v === "object" && "result" in v && typeof v.result === "number") return v.result;
  throw new Error(`${ref} holds no number`);
}

/** Every SUM cell's cached result equals the sum of the cells it covers. */
function expectSumsHonest(ws: ExcelJS.Worksheet, onlyColumns?: string[]) {
  let checked = 0;
  ws.eachRow((row) =>
    row.eachCell((cell) => {
      if (onlyColumns && !onlyColumns.includes(ws.getColumn(cell.col).letter)) return;
      const v = cell.value;
      if (!v || typeof v !== "object" || !("formula" in v)) return;
      const formula = v.formula ?? "";
      const m = /^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/.exec(formula);
      if (!m) return;
      const [, c1 = "", r1, c2 = "", r2] = m;
      const fromCol = ws.getColumn(c1).number;
      const toCol = ws.getColumn(c2).number;
      let sum = 0;
      for (let r = Number(r1); r <= Number(r2); r++)
        for (let c = fromCol; c <= toCol; c++) sum += numberAt(ws, `${ws.getColumn(c).letter}${r}`);
      expect(Math.abs(numberAt(ws, cell.address) - sum), `${cell.address} = ${formula}`).toBeLessThan(1e-9);
      checked += 1;
    }),
  );
  expect(checked).toBeGreaterThan(0);
}

describe("Exports match the invoice: three 20-minute entries at $150/h", () => {
  it("the invoice itself says 1.00 h and $150.00", () => {
    const inv = buildInvoice(entries);
    expect(inv.totalMinutes).toBe(60);
    expect(invoiceCents).toBe(15000);
  });

  it("the Excel timesheet says 1.00 h and $150.00, and its SUM cells agree after Excel recalculates", async () => {
    const wb = await reload(await buildTimesheetWorkbook({ entries, days }));

    const grid = sheet(wb, "Timesheet");
    // Header, one project row, Total row. The grand total sits in the last column of row 3.
    const totalCol = grid.getRow(1).cellCount;
    const grand = grid.getCell(3, totalCol).address;
    expect(numberAt(grid, grand)).toBeCloseTo(1, 9);
    expect(grid.getColumn(totalCol).numFmt).toBe("0.00");
    expectSumsHonest(grid);

    const list = sheet(wb, "Entries");
    for (const r of [2, 3, 4]) {
      expect(numberAt(list, `E${r}`)).toBeCloseTo(20 / 60, 9);
      expect(Math.round(numberAt(list, `H${r}`) * 100)).toBe(5000);
      // The Amount formula E*G gives the same value when Excel recalculates.
      expect(numberAt(list, `E${r}`) * numberAt(list, `G${r}`)).toBeCloseTo(50, 9);
    }
    expect(numberAt(list, "E5")).toBeCloseTo(1, 9);
    expect(Math.round(numberAt(list, "H5") * 100)).toBe(invoiceCents);
    expectSumsHonest(list);
  });

  it("the CSV has Amount 50 and Minutes 20 on each row, adding up to $150.00 and 60 minutes", () => {
    // No field here holds a comma or a quote, so a plain split reads it (BOM first).
    const [header, ...rows] = entriesCsv(entries)
      .replace(/^﻿/, "")
      .trim()
      .split("\r\n")
      .map((line) => line.split(","));
    const minutesCol = header.indexOf("Minutes");
    const amountCol = header.indexOf("Amount");
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row[minutesCol]).toBe("20");
      expect(row[amountCol]).toBe("50");
    }
    const cents = rows.reduce((a, row) => a + Math.round(Number(row[amountCol]) * 100), 0);
    expect(cents).toBe(invoiceCents);
    expect(rows.reduce((a, row) => a + Number(row[minutesCol]), 0)).toBe(60);
  });

  it("the year summary says 1.00 total and billable hours", async () => {
    const report = buildAnnualReport({
      year: 2026,
      entries,
      projects: [
        { id: "p1", name: "Website", hourly_rate: RATE_CENTS, billable: true, client_id: "acme", client_name: "Acme" },
      ],
      invoices: [],
    });
    const wb = await reload(await buildAnnualWorkbook(report, { name: null, ein: null }));
    const summary = sheet(wb, "Summary");
    const summaryValue = (label: string) => {
      let found: number | undefined;
      summary.eachRow((row) => {
        if (row.getCell(1).value === label) found = numberAt(summary, row.getCell(2).address);
      });
      if (found === undefined) throw new Error(`no row ${label}`);
      return found;
    };
    expect(summaryValue("Total hours worked")).toBeCloseTo(1, 9);
    expect(summaryValue("Billable hours")).toBeCloseTo(1, 9);
    // The hours columns; the money columns hold whole cents and are not part of this fix.
    expectSumsHonest(sheet(wb, "Monthly"), ["B", "C"]);
  });
});
