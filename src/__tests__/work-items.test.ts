import { describe, expect, it } from "vitest";

import type { SheetEntry } from "@/lib/timesheet";
import { paginate, searchWorkItems, WORK_ITEMS_PAGE_SIZE } from "@/lib/work-items";

function entry(i: number, over: Partial<SheetEntry> = {}): SheetEntry {
  return {
    id: `e${i}`,
    project_id: "p1",
    date: `2026-10-${String(((i - 1) % 28) + 1).padStart(2, "0")}`,
    minutes: 30 + i,
    note: `task ${i}`,
    started_at: null,
    project: { name: "Website", hourly_rate: 10000, billable: true, client: { name: "Acme", color: "#10b981" } },
    ...over,
  };
}

describe("month work-items list", () => {
  const entries = Array.from({ length: 20 }, (_, i) => entry(i + 1));

  it("shows 7 per page and walks all 20 items across 3 pages", () => {
    expect(WORK_ITEMS_PAGE_SIZE).toBe(7);
    const p1 = paginate(entries, 1);
    expect(p1).toMatchObject({ page: 1, pages: 3, total: 20, from: 1, to: 7 });
    expect(p1.items).toHaveLength(7);
    expect(p1.items[0].id).toBe("e1");

    const p3 = paginate(entries, 3);
    expect(p3).toMatchObject({ page: 3, from: 15, to: 20 });
    expect(p3.items.map((e) => e.id)).toEqual(["e15", "e16", "e17", "e18", "e19", "e20"]);
  });

  it("clamps out-of-range pages and handles an empty list", () => {
    expect(paginate(entries, 99).page).toBe(3);
    expect(paginate(entries, 0).page).toBe(1);
    expect(paginate([], 1)).toMatchObject({ items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });

  it("searches note, project, client and date; every word must match", () => {
    const mixed = [
      entry(1, { note: "homepage hero" }),
      entry(2, {
        note: "invoice export",
        project: { name: "Billing", hourly_rate: 0, billable: true, client: { name: "Globex", color: "#000" } },
      }),
      entry(3, { note: "Homepage footer", date: "2026-10-09" }),
    ];
    expect(searchWorkItems(mixed, "HOMEPAGE").map((e) => e.id)).toEqual(["e1", "e3"]); // case-insensitive
    expect(searchWorkItems(mixed, "globex export").map((e) => e.id)).toEqual(["e2"]); // client + note
    expect(searchWorkItems(mixed, "homepage 2026-10-09").map((e) => e.id)).toEqual(["e3"]); // date narrows
    expect(searchWorkItems(mixed, "nothing like this")).toEqual([]);
    expect(searchWorkItems(mixed, "   ")).toHaveLength(3); // blank search = everything
  });

  it("a search that narrows the list re-paginates from its own total", () => {
    const grouped = Array.from({ length: 20 }, (_, i) =>
      entry(i + 1, { note: `${i < 11 ? "alpha" : "beta"} task ${i + 1}` }),
    );
    const hits = searchWorkItems(grouped, "alpha"); // 11 of the 20
    expect(hits).toHaveLength(11);
    expect(paginate(hits, 1)).toMatchObject({ pages: 2, total: 11, from: 1, to: 7 });
    expect(paginate(hits, 2)).toMatchObject({ from: 8, to: 11 });
    // A bare digit also matches the date (…-10-…), so notes are the place to be specific.
    expect(searchWorkItems(entries, "task 15").map((e) => e.id)).toEqual(["e15"]);
  });
});
