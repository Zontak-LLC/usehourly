import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import { buildTimesheetWorkbook } from "@/lib/export-xlsx";
import { buildSheet, type SheetEntry } from "@/lib/timesheet";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

function entry(over: Partial<SheetEntry> & { id: string; date: string; minutes: number }): SheetEntry {
  return {
    project_id: "p1",
    note: "",
    started_at: null,
    project: { name: "Website", hourly_rate: 10000, billable: true, client: { name: "Acme", color: "#10b981" } },
    ...over,
  };
}

describe("week grid: filling several days at once", () => {
  function setup(existing: unknown[] = []) {
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "p1" }) },
      timeEntry: {
        count: vi.fn(async () => 0),
        findMany: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
    return { prisma, caller };
  }

  it("fills Mon–Fri in one call: creates empty days, updates changed, leaves unchanged alone", async () => {
    const { prisma, caller } = setup([
      { id: "e-tue", date: "2026-10-06", minutes: 120, started_at: null },
      { id: "e-wed", date: "2026-10-07", minutes: 480, started_at: null },
    ]);
    const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
    const res = await caller.entry.bulkSet({ projectId: "p1", cells: days.map((date) => ({ date, minutes: 480 })) });

    expect(res).toEqual({ created: 3, updated: 1, deleted: 0, skipped: [] });
    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith({
      where: { user_id: "u1", project_id: "p1", date: { in: days } },
    });
    expect(prisma.timeEntry.create).toHaveBeenCalledTimes(3);
    expect(prisma.timeEntry.create).toHaveBeenCalledWith({
      data: { user_id: "u1", project_id: "p1", date: "2026-10-05", minutes: 480 },
    });
    expect(prisma.timeEntry.update).toHaveBeenCalledWith({
      where: { id: "e-tue", user_id: "u1" },
      data: { minutes: 480 },
    });
    expect(prisma.timeEntry.update).toHaveBeenCalledTimes(1); // Wednesday already 480 → untouched
  });

  it("fills 3 days at 3 h with one description: new entries carry it, existing days are left alone", async () => {
    const { prisma, caller } = setup([
      { id: "e-wed", date: "2026-10-07", minutes: 60, note: "old note", started_at: null },
    ]);
    const res = await caller.entry.bulkSet({
      projectId: "p1",
      // the popup only sends days it will write (existing days are skipped unless "replace")
      cells: [
        { date: "2026-10-06", minutes: 180 },
        { date: "2026-10-08", minutes: 180 },
      ],
      note: "  ISSUE-42 checkout bug  ",
    });
    expect(res).toEqual({ created: 2, updated: 0, deleted: 0, skipped: [] });
    expect(prisma.timeEntry.create).toHaveBeenCalledWith({
      data: { user_id: "u1", project_id: "p1", date: "2026-10-06", minutes: 180, note: "ISSUE-42 checkout bug" },
    });
    expect(prisma.timeEntry.create).toHaveBeenCalledWith({
      data: { user_id: "u1", project_id: "p1", date: "2026-10-08", minutes: 180, note: "ISSUE-42 checkout bug" },
    });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it("with Replace, an existing day gets the new hours and description; without a note its description is kept", async () => {
    const { prisma, caller } = setup([
      { id: "e-wed", date: "2026-10-07", minutes: 60, note: "old note", started_at: null },
    ]);
    await caller.entry.bulkSet({
      projectId: "p1",
      cells: [{ date: "2026-10-07", minutes: 180 }],
      note: "ISSUE-42 checkout bug",
    });
    expect(prisma.timeEntry.update).toHaveBeenLastCalledWith({
      where: { id: "e-wed", user_id: "u1" },
      data: { minutes: 180, note: "ISSUE-42 checkout bug" },
    });

    // Same hours, new description → still updated (the description alone changed).
    await caller.entry.bulkSet({
      projectId: "p1",
      cells: [{ date: "2026-10-07", minutes: 60 }],
      note: "different words",
    });
    expect(prisma.timeEntry.update).toHaveBeenLastCalledWith({
      where: { id: "e-wed", user_id: "u1" },
      data: { minutes: 60, note: "different words" },
    });

    // No note supplied (or blank): hours change, the stored description is never sent.
    prisma.timeEntry.update.mockClear();
    await caller.entry.bulkSet({ projectId: "p1", cells: [{ date: "2026-10-07", minutes: 240 }], note: "   " });
    expect(prisma.timeEntry.update).toHaveBeenCalledWith({
      where: { id: "e-wed", user_id: "u1" },
      data: { minutes: 240 },
    });
  });

  it("clearing a cell (0) deletes that day's entry, scoped to the owner", async () => {
    const { prisma, caller } = setup([{ id: "e1", date: "2026-10-05", minutes: 60, started_at: null }]);
    const res = await caller.entry.bulkSet({ projectId: "p1", cells: [{ date: "2026-10-05", minutes: 0 }] });
    expect(res.deleted).toBe(1);
    expect(prisma.timeEntry.deleteMany).toHaveBeenCalledWith({ where: { id: "e1", user_id: "u1" } });
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("never merges: days with several entries or a running timer are skipped and reported", async () => {
    const { prisma, caller } = setup([
      { id: "a", date: "2026-10-05", minutes: 30, started_at: null },
      { id: "b", date: "2026-10-05", minutes: 30, started_at: null },
      { id: "c", date: "2026-10-06", minutes: 10, started_at: new Date() },
    ]);
    const res = await caller.entry.bulkSet({
      projectId: "p1",
      cells: [
        { date: "2026-10-05", minutes: 480 },
        { date: "2026-10-06", minutes: 480 },
        { date: "2026-10-07", minutes: 480 },
      ],
    });
    expect(res.skipped).toEqual(["2026-10-05", "2026-10-06"]);
    expect(res.created).toBe(1);
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    expect(prisma.timeEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects someone else's project, signed-out callers and invalid input without touching the DB", async () => {
    const { prisma, caller } = setup();
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(
      caller.entry.bulkSet({ projectId: "theirs", cells: [{ date: "2026-10-05", minutes: 60 }] }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(caller.entry.bulkSet({ projectId: "p1", cells: [] })).rejects.toThrow();
    await expect(caller.entry.bulkSet({ projectId: "p1", cells: [{ date: "5 Oct", minutes: 60 }] })).rejects.toThrow();
    await expect(
      caller.entry.bulkSet({ projectId: "p1", cells: [{ date: "2026-10-05", minutes: 1441 }] }),
    ).rejects.toThrow();

    const anon = createCaller({ session: null, prisma: prisma as never });
    await expect(
      anon.entry.bulkSet({ projectId: "p1", cells: [{ date: "2026-10-05", minutes: 60 }] }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });
});

describe("timesheet pivot", () => {
  it("sums per project/day, flags multi-entry and running cells, and adds empty rows", () => {
    const sheet = buildSheet(
      [
        entry({ id: "1", date: "2026-10-05", minutes: 60 }),
        entry({ id: "2", date: "2026-10-05", minutes: 30 }),
        entry({ id: "3", date: "2026-10-06", minutes: 45, started_at: new Date() }),
      ],
      [{ projectId: "p2", project: "Blog", client: "Acme", color: "#000" }],
    );
    expect(sheet.total).toBe(135);
    expect(sheet.dayTotals).toEqual({ "2026-10-05": 90, "2026-10-06": 45 });
    expect(sheet.rows.map((r) => r.project)).toEqual(["Blog", "Website"]); // sorted; Blog is the empty extra row
    const web = sheet.rows.find((r) => r.projectId === "p1");
    expect(web?.cells["2026-10-05"]).toEqual({ minutes: 90, count: 2, running: false });
    expect(web?.cells["2026-10-06"]).toMatchObject({ count: 1, running: true });
    expect(sheet.rows.find((r) => r.projectId === "p2")?.total).toBe(0);
  });
});

describe("Excel export", () => {
  it("writes a real .xlsx whose grid, formulas and entry rows match the data", async () => {
    const days = ["2026-10-05", "2026-10-06", "2026-10-07"];
    const wb = await buildTimesheetWorkbook({
      days,
      entries: [
        entry({ id: "1", date: "2026-10-05", minutes: 90, note: "homepage" }),
        entry({ id: "2", date: "2026-10-06", minutes: 120 }),
        entry({
          id: "3",
          date: "2026-10-06",
          minutes: 60,
          project_id: "p2",
          project: { name: "Retainer", hourly_rate: 0, billable: false, client: { name: "Zed", color: "#000" } },
        }),
      ],
    });

    // Round-trip through the actual file bytes, like a user opening it.
    const bytes = await wb.xlsx.writeBuffer();
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(bytes);
    expect(read.worksheets.map((w) => w.name)).toEqual(["Timesheet", "Entries"]);

    const grid = read.getWorksheet("Timesheet");
    expect(grid?.getRow(1).getCell(1).value).toBe("Client");
    const acme = grid?.getRow(2);
    expect(acme?.getCell(1).value).toBe("Acme");
    expect(acme?.getCell(2).value).toBe("Website");
    expect(acme?.getCell(3).value).toBe(1.5); // 90 min → decimal hours
    expect(acme?.getCell(4).value).toBe(2);
    // The 7th had nothing logged, so it gets no column: Mon, Tue, then the Total.
    expect(grid?.getRow(1).getCell(5).value).toBe("Total (h)");
    expect(acme?.getCell(5).value).toMatchObject({ formula: "SUM(C2:D2)", result: 3.5 });
    const totalRow = grid?.getRow(4);
    expect(totalRow?.getCell(1).value).toBe("Total");
    expect(totalRow?.getCell(5).value).toMatchObject({ formula: "SUM(E2:E3)", result: 4.5 });

    const detail = read.getWorksheet("Entries");
    expect(detail?.rowCount).toBe(5); // header + 3 entries + total
    const first = detail?.getRow(2);
    expect(first?.getCell(4).value).toBe("homepage");
    expect(first?.getCell(5).value).toBe(1.5);
    expect(first?.getCell(8).value).toMatchObject({ formula: "E2*G2", result: 150 }); // 1.5h × $100
    expect(detail?.getRow(4).getCell(6).value).toBe("No"); // non-billable
    expect(detail?.getRow(4).getCell(8).value).toBeNull();
  });

  it("omits zero-hour days and zero-minute entries from both sheets", async () => {
    const wb = await buildTimesheetWorkbook({
      days: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"],
      entries: [
        entry({ id: "1", date: "2026-10-05", minutes: 60, note: "real" }),
        entry({ id: "2", date: "2026-10-06", minutes: 0, note: "timer just started" }), // 0h → its day drops out
        entry({ id: "3", date: "2026-10-08", minutes: 30 }),
      ],
    });
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(await wb.xlsx.writeBuffer());

    const grid = read.getWorksheet("Timesheet");
    // Header: Client, Project, Mon 5, Thu 8, Total — the 6th (0h entry) and 7th (nothing) are gone.
    expect(grid?.getRow(1).values).toHaveLength(6); // exceljs rows are 1-based: [empty, Client, Project, Mon, Thu, Total]
    expect(grid?.getRow(1).getCell(5).value).toBe("Total (h)");
    expect(grid?.getRow(2).getCell(3).value).toBe(1);
    expect(grid?.getRow(2).getCell(4).value).toBe(0.5);

    const detail = read.getWorksheet("Entries");
    expect(detail?.rowCount).toBe(4); // header + 2 entries + total
    const notes = [2, 3].map((r) => detail?.getRow(r).getCell(4).value);
    expect(notes).not.toContain("timer just started");
  });

  it("exports an empty period without crashing", async () => {
    const wb = await buildTimesheetWorkbook({ days: ["2026-10-05"], entries: [] });
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(await wb.xlsx.writeBuffer());
    expect(read.getWorksheet("Timesheet")?.getRow(2).getCell(1).value).toBe("Total");
  });
});

describe("week grid: several entries on the same day", () => {
  it("adds a second entry for the same project and day without touching the first", async () => {
    const created: unknown[] = [];
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "p1" }) },
      timeEntry: {
        count: vi.fn(async () => 0),
        create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
          created.push(data);
          return { id: `e${created.length}`, ...(data as object) };
        }),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });

    await caller.entry.create({ projectId: "p1", date: "2026-10-12", duration: "2", note: "Standup + planning" });
    await caller.entry.create({ projectId: "p1", date: "2026-10-12", duration: "1:30", note: "Code review" });

    expect(created).toEqual([
      { user_id: "u1", project_id: "p1", date: "2026-10-12", minutes: 120, note: "Standup + planning" },
      { user_id: "u1", project_id: "p1", date: "2026-10-12", minutes: 90, note: "Code review" },
    ]);
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    expect(prisma.timeEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("shows the day as one cell of 3:30 with 2 entries, and the day total counts both", () => {
    const sheet = buildSheet([
      entry({ id: "e1", date: "2026-10-12", minutes: 120, note: "Standup + planning" }),
      entry({ id: "e2", date: "2026-10-12", minutes: 90, note: "Code review" }),
      entry({ id: "e3", date: "2026-10-13", minutes: 60 }),
    ]);
    expect(sheet.rows[0].cells["2026-10-12"]).toEqual({ minutes: 210, count: 2, running: false });
    expect(sheet.dayTotals["2026-10-12"]).toBe(210);
    expect(sheet.total).toBe(270);
  });

  it("adds an entry for another project on the same day as a separate row cell", () => {
    const sheet = buildSheet([
      entry({ id: "e1", date: "2026-10-12", minutes: 120 }),
      entry({
        id: "e2",
        date: "2026-10-12",
        minutes: 45,
        project_id: "p2",
        project: { name: "Support", hourly_rate: 8000, billable: true, client: { name: "Acme", color: "#10b981" } },
      }),
    ]);
    expect(sheet.rows.map((r) => [r.project, r.cells["2026-10-12"].minutes])).toEqual([
      ["Support", 45],
      ["Website", 120],
    ]);
    expect(sheet.dayTotals["2026-10-12"]).toBe(165);
  });
});
