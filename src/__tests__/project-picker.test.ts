import { describe, expect, it } from "vitest";

import {
  chipProjects,
  highlightParts,
  type PickerProject,
  pickerRows,
  pushRecentId,
  rankProjects,
  togglePinnedId,
} from "@/lib/project-picker";

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

  it("pinned projects come right after the picked one and get room, up to six chips; recent ones fill what is left", () => {
    // two pins: picked + 2 pins = 3 chips, the recent one has no room
    expect(chipProjects(many, ["e"], "a", ["f", "d"]).map((p) => p.id)).toEqual(["a", "f", "d"]);
    // four pins and a picked project that is not pinned: five chips
    expect(chipProjects(many, [], "a", ["b", "c", "d", "e"]).map((p) => p.id)).toEqual(["a", "b", "c", "d", "e"]);
    // the picked project is itself pinned: it is not counted twice
    expect(chipProjects(many, [], "b", ["b", "c", "d", "e"]).map((p) => p.id)).toEqual(["b", "c", "d", "e"]);
    // a pin for a project that was archived or deleted is ignored
    expect(chipProjects(many, [], "a", ["gone", "c"]).map((p) => p.id)).toEqual(["a", "c", "b"]);
  });

  it("toggles a pin, and a seventh pin pushes the oldest one out", () => {
    expect(togglePinnedId([], "a")).toEqual(["a"]);
    expect(togglePinnedId(["a", "b"], "a")).toEqual(["b"]);
    expect(togglePinnedId(["1", "2", "3", "4", "5", "6"], "7")).toEqual(["2", "3", "4", "5", "6", "7"]);
  });

  it("remembers the newest first, without repeats, and stays short", () => {
    expect(pushRecentId(["b", "a"], "a")).toEqual(["a", "b"]);
    const long = pushRecentId(["1", "2", "3", "4", "5", "6", "7", "8"], "9");
    expect(long).toHaveLength(8);
    expect(long[0]).toBe("9");
  });

  it("ranks matches: a name that starts with it, then a word that does, then contains, then only the client", () => {
    const set = [
      P("1", "Brand refresh", "Zed"), // client does not match; name starts with "br"
      P("2", "Admin and branding", "Zed"), // a word starts with "br"
      P("3", "Embryo study", "Zed"), // only contains "br"
      P("4", "Support", "Brightwell"), // matched only through its client
    ];
    expect(rankProjects(set, "br").map((p) => p.id)).toEqual(["1", "2", "3", "4"]);
    // nothing typed: every project, by name
    expect(rankProjects(set, "").map((p) => p.id)).toEqual(["2", "1", "3", "4"]);
    expect(rankProjects(many, "acme app").map((p) => p.id)).toEqual(["b"]);
    expect(rankProjects(many, "nothing like it")).toEqual([]);
  });

  it("marks the typed letters for bold, ignoring case and treating punctuation as plain text", () => {
    expect(highlightParts("Mobile app", "mo")).toEqual([
      { text: "Mo", hit: true, at: 0 },
      { text: "bile app", hit: false, at: 2 },
    ]);
    expect(highlightParts("Mobile app", "")).toEqual([{ text: "Mobile app", hit: false, at: 0 }]);
    expect(highlightParts("R&D (2026)", "(20")).toEqual([
      { text: "R&D ", hit: false, at: 0 },
      { text: "(20", hit: true, at: 4 },
      { text: "26)", hit: false, at: 7 },
    ]);
  });

  it("the list: recent first, then every project under its client; typing makes it one ranked list", () => {
    const rows = pickerRows(many, "", ["e", "zzz", "a"]);
    expect(rows.sections.map((s) => s.title)).toEqual(["Recent", "Acme", "Beta", "Cobalt"]);
    expect(rows.sections[0].items.map((p) => p.id)).toEqual(["e", "a"]);
    expect(rows.sections[1].items.map((p) => p.name)).toEqual(["Mobile app", "Website"]);
    // the arrow keys walk the rows in the order they appear
    expect(rows.flat.map((p) => p.id)).toEqual(["e", "a", "b", "a", "d", "c", "e", "f"]);
    const typed = pickerRows(many, "s", ["e"]);
    expect(typed.sections).toHaveLength(1);
    expect(typed.sections[0].title).toBeNull();
    expect(pickerRows(many, "qqq", []).sections).toEqual([]);
  });
});
