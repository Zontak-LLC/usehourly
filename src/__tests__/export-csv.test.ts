import { describe, expect, it } from "vitest";

import { categoryLabel } from "@/lib/expenses";
import { csvFilename, type ExpenseCsvRow, type ExportPlan, entriesCsv, planExport } from "@/lib/export-all";
import { exportableEntries, type SheetEntry } from "@/lib/timesheet";

/**
 * "Download this week/month as CSV" in the Export menu: the file is named after the Excel download, and holds the same
 * entries the Excel file writes (one shared filter, `exportableEntries`).
 */
function entry(over: Partial<SheetEntry> & { id: string; minutes: number }): SheetEntry {
  return {
    project_id: "p1",
    date: "2026-10-20",
    note: "",
    started_at: null,
    project: { name: "General", hourly_rate: 10000, billable: true, client: { name: "Acme", color: "#10b981" } },
    ...over,
  };
}

describe("csvFilename", () => {
  it("swaps .xlsx for .csv on the week and month names", () => {
    expect(csvFilename("usehourly-2026-10-19_to_2026-10-25.xlsx")).toBe("usehourly-2026-10-19_to_2026-10-25.csv");
    expect(csvFilename("usehourly-2026-10.xlsx")).toBe("usehourly-2026-10.csv");
  });
});

describe("exportableEntries", () => {
  it("drops entries with 0 minutes and entries on non-billable days, and keeps the rest in order", () => {
    const kept = entry({ id: "a", minutes: 90 });
    const alsoKept = entry({ id: "d", minutes: 15, non_billable: false });
    const out = exportableEntries([
      kept,
      entry({ id: "b", minutes: 0, started_at: "2026-10-20T09:00:00Z" }), // a timer that just started
      entry({ id: "c", minutes: 60, non_billable: true }),
      alsoKept,
    ]);
    expect(out.map((e) => e.id)).toEqual(["a", "d"]);
  });

  it("gives the CSV row the Week page downloads, and a header-only file when nothing is left", () => {
    const csv = entriesCsv(exportableEntries([entry({ id: "a", minutes: 90, note: "Design" })]), "USD");
    expect(csv.split("\r\n").slice(0, 2)).toEqual([
      "﻿Date,Client,Project,Note,Hours,Minutes,Billable,Rate (per hour),Amount,Currency",
      "2026-10-20,Acme,General,Design,1.5,90,Yes,100,150,USD",
    ]);
    const empty = entriesCsv(exportableEntries([entry({ id: "b", minutes: 0 })]), "USD");
    expect(empty).toBe("﻿Date,Client,Project,Note,Hours,Minutes,Billable,Rate (per hour),Amount,Currency\r\n");
  });
});

describe("expenses in 'export everything'", () => {
  const office: ExpenseCsvRow = {
    date: "2026-03-04",
    kind: "expense",
    category: "office",
    amount_cents: 1250,
    currency: "USD",
    note: "Paper",
    distance: null,
    distance_unit: null,
    mileage_rate: null,
    client: { name: "Acme" },
  };
  const trip: ExpenseCsvRow = {
    date: "2025-11-02",
    kind: "mileage",
    category: "mileage",
    amount_cents: 861, // 12.3 mi at $0.70
    currency: "USD",
    note: null,
    distance: 123,
    distance_unit: "mi",
    mileage_rate: 700,
    client: null,
  };
  const text = (plan: ExportPlan, path: string) => plan.files.find((f) => f.path === path)?.content as string;

  it("adds expenses.csv, oldest first in real units, and a README line", async () => {
    const plan = await planExport({
      entries: [entry({ id: "a", minutes: 60 })],
      invoices: [],
      expenses: [office, trip],
      today: "2026-10-25",
    });
    expect(text(plan, "expenses.csv")).toBe(
      "﻿Date,Kind,Category,Amount,Currency,Distance,Unit,Rate (per unit),Client,Note\r\n" +
        `2025-11-02,Mileage,${categoryLabel("mileage")},8.61,USD,12.3,mi,0.70,,\r\n` +
        `2026-03-04,Expense,${categoryLabel("office")},12.5,USD,,,,Acme,Paper\r\n`,
    );
    expect(text(plan, "README.txt")).toContain("\r\n  expenses.csv       Your expenses and mileage trips (2).\r\n");
  });

  it("leaves expenses.csv and its README line out when there are none", async () => {
    for (const expenses of [[], undefined]) {
      const plan = await planExport({
        entries: [entry({ id: "a", minutes: 60 })],
        invoices: [],
        ...(expenses ? { expenses } : {}),
        today: "2026-10-25",
      });
      expect(plan.files.map((f) => f.path)).toEqual([
        "README.txt",
        "all-time.xlsx",
        "all-entries.csv",
        "by-client/Acme.xlsx",
      ]);
      expect(text(plan, "README.txt")).not.toContain("expenses");
    }
  });
});
