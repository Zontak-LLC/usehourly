import { describe, expect, it } from "vitest";

import { toggleProjectFilter } from "@/components/project-filter";
import { buildSheet, type SheetEntry } from "@/lib/timesheet";

/** A freelancer clicks a project's name on the Week grid to see only that project, and again to see all. */
describe("week grid: click a row to filter", () => {
  it("narrows to the clicked project, then clears when it is clicked again", () => {
    let filter = "";
    filter = toggleProjectFilter(filter, "p1");
    expect(filter).toBe("p1");
    filter = toggleProjectFilter(filter, "p2"); // another row while filtered switches projects
    expect(filter).toBe("p2");
    filter = toggleProjectFilter(filter, "p2");
    expect(filter).toBe("");
  });

  it("the filtered week shows only that project's row", () => {
    const entry = (id: string, name: string, client: string, date: string, minutes: number): SheetEntry => ({
      id: `${id}-${date}`,
      project_id: id,
      date,
      minutes,
      note: "",
      started_at: null,
      project: { name, hourly_rate: 50, billable: true, client: { name: client, color: "#111" } },
    });
    const entries = [entry("p1", "Site", "Acme", "2026-10-12", 60), entry("p2", "App", "Beta", "2026-10-13", 90)];
    const filter = toggleProjectFilter("", "p2");
    const sheet = buildSheet(entries.filter((e) => !filter || e.project_id === filter));
    expect(sheet.rows.map((r) => r.projectId)).toEqual(["p2"]);
    expect(sheet.rows[0].cells["2026-10-13"].minutes).toBe(90);
  });
});
