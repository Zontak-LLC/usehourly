import { describe, expect, it } from "vitest";

import { chipProjects, type PickerProject, pushRecentId, searchGroups } from "@/lib/project-picker";

const P = (id: string, name: string, clientName: string): PickerProject => ({ id, name, clientName });
const many = [
  P("a", "Website", "Acme"),
  P("b", "Mobile app", "Acme"),
  P("c", "Support", "Beta"),
  P("d", "Logo", "Beta"),
  P("e", "Audit", "Cobalt"),
  P("f", "Retainer", "Cobalt"),
];

describe("project picker rules", () => {
  it("shows every project as a chip while there are three or fewer, and recent ones plus the selection when there are more", () => {
    expect(chipProjects(many.slice(0, 3), ["c"], "a").map((p) => p.id)).toEqual(["a", "b", "c"]);
    // a fourth project starts the picker: three chips, the rest behind search
    expect(chipProjects(many.slice(0, 4), ["d"], "a").map((p) => p.id)).toEqual(["a", "d", "b"]);
    // selected first, then recents in order, then list order to fill
    expect(chipProjects(many, ["e", "c"], "f").map((p) => p.id)).toEqual(["f", "e", "c"]);
    expect(chipProjects(many, [], "").map((p) => p.id)).toEqual(["a", "b", "c"]);
    // remembered ids that were deleted or archived are ignored, and nothing repeats
    expect(chipProjects(many, ["zzz", "e", "e"], "e").map((p) => p.id)).toEqual(["e", "a", "b"]);
  });

  it("remembers the newest first, without repeats, and stays short", () => {
    expect(pushRecentId(["b", "a"], "a")).toEqual(["a", "b"]);
    const long = pushRecentId(["1", "2", "3", "4", "5", "6", "7", "8"], "9");
    expect(long).toHaveLength(8);
    expect(long[0]).toBe("9");
  });

  it("searches project and client names by every word, grouped by client, with recent projects on top when not searching", () => {
    const idle = searchGroups(many, ["d", "a"], "");
    expect(idle[0]).toMatchObject({ clientName: "Recent" });
    expect(idle[0].projects.map((p) => p.id)).toEqual(["d", "a"]);
    expect(idle.slice(1).map((g) => g.clientName)).toEqual(["Acme", "Beta", "Cobalt"]);

    expect(searchGroups(many, ["d"], "beta").map((g) => [g.clientName, g.projects.map((p) => p.id)])).toEqual([
      ["Beta", ["c", "d"]],
    ]);
    expect(searchGroups(many, [], "acme app").flatMap((g) => g.projects.map((p) => p.id))).toEqual(["b"]);
    expect(searchGroups(many, [], "nothing like it")).toEqual([]);
  });
});
