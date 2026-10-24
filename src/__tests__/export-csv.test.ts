import { describe, expect, it } from "vitest";

import { csvFilename, entriesCsv } from "@/lib/export-all";
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
