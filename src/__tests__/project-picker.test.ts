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
  it("shows every project as a chip while there are three or fewer, and recent ones when there are more", () => {
    expect(chipProjects(many.slice(0, 3), ["c"]).map((p) => p.id)).toEqual(["a", "b", "c"]);
    // a fourth project starts the picker: three chips, the rest behind search
    expect(chipProjects(many.slice(0, 4), ["d"]).map((p) => p.id)).toEqual(["d", "a", "b"]);
    // recents in order, then list order to fill
    expect(chipProjects(many, ["e", "c"]).map((p) => p.id)).toEqual(["e", "c", "a"]);
    expect(chipProjects(many, []).map((p) => p.id)).toEqual(["a", "b", "c"]);
    // remembered ids that were deleted or archived are ignored, and nothing repeats
    expect(chipProjects(many, ["zzz", "e", "e"]).map((p) => p.id)).toEqual(["e", "a", "b"]);
  });

  it("picking a project never reorders the chips: the order depends only on what was remembered and pinned", () => {
    // the same inputs give the same row, whichever chip is picked (the picked one is pressed, not moved)
    const before = chipProjects(many, ["e", "c"], ["f"]).map((p) => p.id);
    expect(before).toEqual(["f", "e", "c"]);
    // the picker keeps the recents read at page load for the chips, so a pick changes nothing until the next visit
    const recentAtLoad = ["e", "c"];
    const afterPick = pushRecentId(recentAtLoad, "c"); // what is saved for next time
    expect(chipProjects(many, recentAtLoad, ["f"]).map((p) => p.id)).toEqual(before);
    // next visit: the newly used project leads the recents
    expect(chipProjects(many, afterPick, ["f"]).map((p) => p.id)).toEqual(["f", "c", "e"]);
  });

  it("pinned projects come first and get room, up to six chips; recent ones fill what is left", () => {
    // two pins: 3 chips, the recent one takes the last slot
    expect(chipProjects(many, ["e"], ["f", "d"]).map((p) => p.id)).toEqual(["f", "d", "e"]);
    // four pins: four chips
    expect(chipProjects(many, [], ["b", "c", "d", "e"]).map((p) => p.id)).toEqual(["b", "c", "d", "e"]);
    // seven pins are capped at six chips
    expect(chipProjects([...many, P("g", "Extra", "Zed")], [], ["a", "b", "c", "d", "e", "f", "g"])).toHaveLength(6);
    // a pin for a project that was archived or deleted is ignored
    expect(chipProjects(many, [], ["gone", "c"]).map((p) => p.id)).toEqual(["c", "a", "b"]);
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
