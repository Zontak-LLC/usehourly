import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { addDays } from "@/lib/dates";
import { type InvoiceRow, planExport, zipBytes } from "@/lib/export-all";
import {
  checkRange,
  describeRange,
  MAX_RANGE_DAYS,
  presetRange,
  rangeFilename,
  WEEKLY_AFTER_WORKED_DAYS,
} from "@/lib/export-range";
import { buildTimesheetWorkbook } from "@/lib/export-xlsx";
import { dateRange, type SheetEntry } from "@/lib/timesheet";

function entry(over: Partial<SheetEntry> & { id: string; date: string; minutes: number }): SheetEntry {
  return {
    project_id: "p1",
    note: "",
    started_at: null,
    project: { name: "Website", hourly_rate: 10000, billable: true, client: { name: "Acme", color: "#10b981" } },
    ...over,
  };
}

/** A file inside a zip, or a clear failure if it is missing. */
function fileIn(zip: JSZip, path: string): JSZip.JSZipObject {
  const f = zip.file(path);
  if (!f) throw new Error(`${path} is not in the zip`);
  return f;
}

async function loadWorkbook(zip: JSZip, path: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await fileIn(zip, path).async("nodebuffer")) as never);
  return wb;
}

async function readSheet(wb: ExcelJS.Workbook, name: string) {
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(await wb.xlsx.writeBuffer());
  const ws = read.getWorksheet(name);
  if (!ws) throw new Error(`no sheet ${name}`);
  return ws;
}

describe("Choosing a custom range, like March 3 to April 20", () => {
  it("accepts a normal range and counts its days", () => {
    expect(checkRange("2026-03-03", "2026-04-20")).toEqual({ ok: true, days: 49 });
    expect(checkRange("2026-03-03", "2026-03-03")).toEqual({ ok: true, days: 1 });
  });

  it("says what is wrong in plain words, and refuses to export", () => {
    const cases: [string, string, RegExp][] = [
      ["", "2026-04-20", /start date and an end date/],
      ["2026-03-03", "", /start date and an end date/],
      ["2026-04-20", "2026-03-03", /before the start/],
      ["2026-02-30", "2026-03-03", /doesn't look right/],
      ["2025-01-01", "2026-12-31", /up to a year/],
    ];
    for (const [from, to, message] of cases) {
      const r = checkRange(from, to);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(message);
    }
    // exactly a year (and a leap day) is the limit
    expect(checkRange("2026-01-01", addDays("2026-01-01", MAX_RANGE_DAYS - 1)).ok).toBe(true);
    expect(checkRange("2026-01-01", addDays("2026-01-01", MAX_RANGE_DAYS)).ok).toBe(false);
  });

  it("describes the range the way a person would say it", () => {
    expect(describeRange("2026-03-03", "2026-04-20")).toBe("Mar 3 – Apr 20, 2026 · 49 days");
    expect(describeRange("2026-03-03", "2026-03-03")).toBe("Mar 3 – Mar 3, 2026 · 1 day");
    expect(describeRange("2025-11-20", "2026-01-10")).toBe("Nov 20, 2025 – Jan 10, 2026 · 52 days");
  });

  it("offers quick picks that mean what they say", () => {
    const today = "2026-10-14";
    expect(presetRange("this-month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("last-month", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("this-quarter", today)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(presetRange("last-30", today)).toEqual({ from: "2026-09-15", to: "2026-10-14" });
    expect(presetRange("year-to-date", today)).toEqual({ from: "2026-01-01", to: "2026-10-14" });
    expect(presetRange("last-year", today)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    // across a year boundary, and a short month
    expect(presetRange("last-month", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("this-month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    // every preset is itself a valid range
    for (const key of ["this-month", "last-month", "this-quarter", "last-30", "year-to-date", "last-year"] as const) {
      const r = presetRange(key, today);
      expect(checkRange(r.from, r.to).ok).toBe(true);
    }
  });

  it("names the file after what it covers", () => {
    expect(rangeFilename("2026-03-03", "2026-04-20")).toBe("usehourly-2026-03-03_to_2026-04-20.xlsx");
    expect(rangeFilename("2026-03-03", "2026-04-20", "Patient portal / v2")).toBe(
      "usehourly-2026-03-03_to_2026-04-20-patient-portal-v2.xlsx",
    );
  });
});

describe("Exporting a range that spans months", () => {
  it("writes a header with the month, so Mar 3 and Apr 3 can never be confused", async () => {
    const entries = [
      entry({ id: "1", date: "2026-03-03", minutes: 90 }),
      entry({ id: "2", date: "2026-03-31", minutes: 60 }),
      entry({ id: "3", date: "2026-04-03", minutes: 120 }),
      entry({ id: "4", date: "2026-04-20", minutes: 30 }),
    ];
    const days = dateRange("2026-03-03", "2026-04-20", addDays);
    expect(days).toHaveLength(49);

    const grid = await readSheet(await buildTimesheetWorkbook({ entries, days, range: true }), "Timesheet");
    const header = (grid.getRow(1).values as unknown[]).slice(1);
    expect(header[0]).toBe("Client");
    expect(header[1]).toBe("Project");
    // only the four days that were worked get a column, each with its month
    expect(header.slice(2, 6).map((h) => String(h))).toEqual([
      expect.stringMatching(/Mar.*3|3.*Mar/),
      expect.stringMatching(/Mar.*31|31.*Mar/),
      expect.stringMatching(/Apr.*3|3.*Apr/),
      expect.stringMatching(/Apr.*20|20.*Apr/),
    ]);
    expect(header[6]).toBe("Total (h)");
    expect(grid.getRow(2).getCell(7).value).toMatchObject({ formula: "SUM(C2:F2)", result: 5 });
  });

  it("keeps the normal week/month export exactly as before (no month in the header)", async () => {
    const entries = [entry({ id: "1", date: "2026-10-05", minutes: 60 })];
    const grid = await readSheet(await buildTimesheetWorkbook({ entries, days: ["2026-10-05"] }), "Timesheet");
    expect(String(grid.getRow(1).getCell(3).value)).toMatch(/^Mon,? 5$|^Mon 5$|5/);
    expect(String(grid.getRow(1).getCell(3).value)).not.toMatch(/Oct/);
  });

  it("switches a long range to one column per week, with the totals unchanged", async () => {
    // every weekday from Jan 5 to Jun 30, 2026, 2 hours a day
    const all = dateRange("2026-01-05", "2026-06-30", addDays).filter((d) => {
      const dow = new Date(`${d}T00:00:00`).getDay();
      return dow !== 0 && dow !== 6;
    });
    expect(all.length).toBeGreaterThan(WEEKLY_AFTER_WORKED_DAYS);
    const entries = all.map((d, i) => entry({ id: String(i), date: d, minutes: 120 }));
    const days = dateRange("2026-01-05", "2026-06-30", addDays);

    const grid = await readSheet(await buildTimesheetWorkbook({ entries, days, range: true }), "Timesheet");
    const header = (grid.getRow(1).values as unknown[]).slice(1).map(String);
    const weekCols = header.filter((h) => h.startsWith("Week of"));
    expect(weekCols.length).toBe(26); // 26 Monday-start weeks, not ~129 day columns
    expect(header[header.length - 1]).toBe("Total (h)");

    // each full week is 5 days x 2 h = 10 h, and the row total is every entry
    expect(grid.getRow(2).getCell(3).value).toBe(10);
    const totalCol = header.length + 0; // 1-based position of the Total column
    expect(grid.getRow(2).getCell(totalCol).value).toMatchObject({ result: all.length * 2 });

    // without the range flag the same data is still one column per day
    const dayGrid = await readSheet(await buildTimesheetWorkbook({ entries, days }), "Timesheet");
    expect((dayGrid.getRow(1).values as unknown[]).length - 1).toBe(2 + all.length + 1);
  });
});

describe("Export everything as a zip", () => {
  const entries: SheetEntry[] = [
    entry({ id: "1", date: "2026-03-03", minutes: 90, note: "Homepage, hero & nav" }),
    entry({ id: "2", date: "2026-03-04", minutes: 60, note: 'Said "ship it"\nsecond line' }),
    entry({
      id: "3",
      date: "2026-04-20",
      minutes: 150,
      project_id: "p2",
      project: { name: "Menu", hourly_rate: 7000, billable: true, client: { name: "Fernhill Café", color: "#f59e0b" } },
    }),
    entry({
      id: "4",
      date: "2026-04-21",
      minutes: 45,
      project_id: "p3",
      project: { name: "Retainer", hourly_rate: 0, billable: false, client: { name: "Acme", color: "#10b981" } },
    }),
    entry({ id: "5", date: "2026-04-22", minutes: 0, note: "timer just started" }), // left out everywhere
  ];
  const invoices: InvoiceRow[] = [
    {
      number: "INV-2026-001",
      client_name: "Acme",
      issue_date: "2026-04-01",
      due_date: "2026-04-15",
      paid_date: "2026-04-10",
      period_from: "2026-03-01",
      period_to: "2026-03-31",
      total_minutes: 150,
      total_cents: 25000,
    },
    {
      number: "INV-2026-002",
      client_name: "Fernhill Café",
      issue_date: "2026-04-30",
      due_date: null,
      paid_date: null,
      period_from: "2026-04-01",
      period_to: "2026-04-30",
      total_minutes: 150,
      total_cents: 17500,
    },
  ];

  async function build(e = entries, inv = invoices) {
    const plan = await planExport({ entries: e, invoices: inv, today: "2026-10-14" });
    const zip = await JSZip.loadAsync(await zipBytes(plan));
    return { plan, zip };
  }

  it("never lets a note or name run as a spreadsheet formula when the CSV is opened", async () => {
    const evil = [
      entry({ id: "x1", date: "2026-03-03", minutes: 30, note: '=HYPERLINK("http://evil.example","click")' }),
      entry({ id: "x2", date: "2026-03-04", minutes: 30, note: "+1+1" }),
      entry({ id: "x3", date: "2026-03-05", minutes: 30, note: "@SUM(A1)" }),
      entry({ id: "x4", date: "2026-03-06", minutes: 30, note: "-2+3" }),
      entry({ id: "x5", date: "2026-03-07", minutes: 30, note: "plain note, with comma" }),
    ];
    const { zip } = await build(evil, []);
    const csv = await fileIn(zip, "all-entries.csv").async("string");
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(csv).toContain("'+1+1");
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).toContain("'-2+3");
    expect(csv).toContain('"plain note, with comma"');
    // a cell never *starts* with a formula character, apart from the header row's BOM
    for (const line of csv.replace("\uFEFF", "").split("\r\n")) {
      for (const cell of line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g) ?? []) {
        const v = cell.replace(/^,/, "").replace(/^"/, "");
        expect(v).not.toMatch(/^[=+@]/);
      }
    }
  });

  it("contains a readme, the combined workbook, the CSVs and one workbook per client", async () => {
    const { plan, zip } = await build();
    expect(
      Object.keys(zip.files)
        .filter((n) => !zip.files[n].dir)
        .sort(),
    ).toEqual([
      "README.txt",
      "all-entries.csv",
      "all-time.xlsx",
      "by-client/Acme.xlsx",
      "by-client/Fernhill Café.xlsx",
      "invoices.csv",
    ]);
    expect(plan.entryCount).toBe(4);
    expect(plan.clientCount).toBe(2);
    expect(plan.totalMinutes).toBe(90 + 60 + 150 + 45);

    const readme = await fileIn(zip, "README.txt").async("string");
    expect(readme).toContain("Created 2026-10-14");
    expect(readme).toContain("4 entries, 2 clients, 5.75 hours, from 2026-03-03 to 2026-04-21");
    expect(readme).toContain("by-client/");
    expect(readme).toContain("invoices.csv");
  });

  it("writes a CSV that opens correctly: BOM, quoting, decimal hours, amounts", async () => {
    const { zip } = await build();
    const csv = await fileIn(zip, "all-entries.csv").async("string");
    expect(csv.charCodeAt(0)).toBe(0xfeff); // so Excel reads it as UTF-8
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Date,Client,Project,Note,Hours,Minutes,Billable,Rate ($/h),Amount ($)");
    // commas, quotes and line breaks inside a note stay inside one field
    expect(csv).toContain('"Homepage, hero & nav"');
    expect(csv).toContain('"Said ""ship it""\nsecond line"');
    expect(csv).toContain('2026-03-03,Acme,Website,"Homepage, hero & nav",1.5,90,Yes,100,150');
    expect(csv).toContain("Fernhill Café,Menu"); // accents survive
    expect(csv).toContain("2026-04-21,Acme,Retainer,,0.75,45,No,,"); // not billable: no rate or amount
    expect(csv).not.toContain("timer just started"); // zero-minute entry left out
  });

  it("writes the invoice history with a plain Paid / Unpaid status", async () => {
    const { zip } = await build();
    const csv = await fileIn(zip, "invoices.csv").async("string");
    expect(csv).toContain("Number,Client,Issued,Due,Paid,Period from,Period to,Hours,Total ($),Status");
    expect(csv).toContain("INV-2026-001,Acme,2026-04-01,2026-04-15,2026-04-10,2026-03-01,2026-03-31,2.5,250,Paid");
    expect(csv).toContain("INV-2026-002,Fernhill Café,2026-04-30,,,2026-04-01,2026-04-30,2.5,175,Unpaid");
  });

  it("gives each client a real workbook that holds only that client's time", async () => {
    const { zip } = await build();
    const acme = await loadWorkbook(zip, "by-client/Acme.xlsx");
    expect(acme.worksheets.map((w) => w.name)).toEqual(["Timesheet", "Entries"]);
    const rows = acme.getWorksheet("Entries");
    if (!rows) throw new Error("no Entries sheet");
    const clients = new Set<string>();
    rows.eachRow((r, n) => n > 1 && r.getCell(2).value !== "" && clients.add(String(r.getCell(2).value)));
    expect(clients.has("Fernhill Café")).toBe(false);
    expect(clients.has("Acme")).toBe(true);

    const all = await loadWorkbook(zip, "all-time.xlsx");
    const total = all.getWorksheet("Entries")?.lastRow;
    if (!total) throw new Error("no totals row");
    expect(total.getCell(1).value).toBe("Total");
    expect(total.getCell(5).value).toMatchObject({ result: 5.75 });
  });

  it("keeps file names safe and unique when client names clash or have odd characters", async () => {
    const odd = [
      entry({
        id: "a",
        date: "2026-05-01",
        minutes: 60,
        project: { name: "X", hourly_rate: 0, billable: false, client: { name: "A/B: Co.", color: "#000" } },
      }),
      entry({
        id: "b",
        date: "2026-05-02",
        minutes: 60,
        project_id: "p9",
        project: { name: "Y", hourly_rate: 0, billable: false, client: { name: "A B Co.", color: "#000" } },
      }),
      entry({
        id: "c",
        date: "2026-05-03",
        minutes: 60,
        project_id: "p10",
        project: { name: "Z", hourly_rate: 0, billable: false, client: { name: "***", color: "#000" } },
      }),
    ];
    const { zip } = await build(odd, []);
    const names = Object.keys(zip.files).filter((n) => n.startsWith("by-client/") && !zip.files[n].dir);
    expect(names).toHaveLength(3);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3);
    for (const n of names) expect(n.slice("by-client/".length)).not.toMatch(/[\\/:*?"<>|]/);
    expect(await zip.file("invoices.csv")).toBeNull(); // no invoices, no empty file
  });

  it("still produces a tidy zip when nothing has been logged yet", async () => {
    const { plan, zip } = await build([], []);
    expect(plan.entryCount).toBe(0);
    const readme = await fileIn(zip, "README.txt").async("string");
    expect(readme).toContain("You have not logged any time yet.");
    expect(zip.file("all-time.xlsx")).not.toBeNull();
    expect(Object.keys(zip.files).some((n) => n.startsWith("by-client/"))).toBe(false);
  });
});
