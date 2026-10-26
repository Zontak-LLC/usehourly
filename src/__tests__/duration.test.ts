import { describe, expect, it } from "vitest";

import { addChipTime, formatDuration, parseDuration } from "@/lib/duration";

describe("freelancer duration entry", () => {
  it.each([
    ["1.5", 90],
    ["1:30", 90],
    ["90m", 90],
    ["2h", 120],
    ["1h30", 90],
    ["1h 30m", 90],
    ["2", 120],
    ["45", 45],
    ["0:15", 15],
    ["1.5h", 90],
    ["30 min", 30],
  ])("parses %s → %i minutes", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(["", "abc", "1:75", "-2", "1h:", "h"])("rejects %j", (input) => {
    expect(parseDuration(input)).toBeNull();
  });

  // QA 2026-10-25: "+ 1 hour" then "+ 30 min" saved 0:30, because a different chip replaced the value.
  it.each([
    ["", 60, 0, 60], // empty box: the chip's own amount
    ["1h", 30, 60, 90], // "+ 1 hour" then "+ 30 min" = 1:30
    ["1:15", 30, 75, 105], // a typed time then a chip = 1:45
    ["2h", 120, 120, 240], // the same chip again still adds up
    ["abc", 60, 0, 60], // text that cannot be read: start from the chip's amount
  ])("a chip adds to %j: +%i → %i to %i", (current, chip, from, to) => {
    expect(addChipTime(current, chip)).toEqual({ from, to });
  });

  it("chips tapped one after another add up to the total a freelancer expects", () => {
    let box = "";
    for (const chip of [60, 30, 120]) box = formatDuration(addChipTime(box, chip).to);
    expect(box).toBe("3:30");
  });

  it("formats minutes as h:mm", () => {
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(5)).toBe("0:05");
  });
});
