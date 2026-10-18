import { describe, expect, it } from "vitest";

import { chipProjects, type PickerProject, pushRecentId, searchProjects } from "@/lib/project-picker";

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

  it("searches project and client names by every word, in one flat list sorted by project name", () => {
    expect(searchProjects(many, "").map((p) => p.id)).toEqual(["e", "d", "b", "f", "c", "a"]);
    expect(searchProjects(many, "beta").map((p) => p.id)).toEqual(["d", "c"]);
    expect(searchProjects(many, "acme app").map((p) => p.id)).toEqual(["b"]);
    expect(searchProjects(many, "nothing like it")).toEqual([]);
  });
});
