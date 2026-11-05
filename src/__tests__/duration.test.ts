import { describe, expect, it } from "vitest";

import {
  addChipTime,
  DURATION_NOT_POSITIVE,
  DURATION_TOO_LONG,
  DURATION_UNREADABLE,
  formatDuration,
  minutesHint,
  parseDuration,
  readDuration,
} from "@/lib/duration";

describe("freelancer duration entry", () => {
  it.each([
    ["1.5", 90],
    ["1:30", 90],
    ["90m", 90],
    ["2h", 120],
    ["1h30", 90],
    ["1h 30m", 90],
    ["2", 120],
    ["0:15", 15],
    ["1.5h", 90],
    ["30 min", 30],
    ["25m", 25],
    // Issue 435: a comma works as a decimal point, and every bare number up to 24 is hours.
    ["1,5", 90],
    ["1,5h", 90],
    ["13", 780],
    ["24", 1440],
  ])("parses %s → %i minutes", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
    expect(readDuration(input)).toEqual({ minutes: expected });
  });

  it.each([
    ["", DURATION_UNREADABLE],
    ["abc", DURATION_UNREADABLE],
    ["1:75", DURATION_UNREADABLE],
    ["1h:", DURATION_UNREADABLE],
    ["h", DURATION_UNREADABLE],
    // A thousands mark or a list is not a decimal comma: "1,000" must never log one hour.
    ["1,000", DURATION_UNREADABLE],
    ["1,2,3", DURATION_UNREADABLE],
    // A bare whole number over 24 was most likely meant as minutes: say so instead of guessing (issue 435).
    ["45", "Did you mean 45 minutes? Type 45m"],
    ["25", "Did you mean 25 minutes? Type 25m"],
    ["25.5", DURATION_TOO_LONG],
    ["0", "Enter more than 0, like 1:30"],
    ["0:00", DURATION_NOT_POSITIVE],
    ["0m", DURATION_NOT_POSITIVE],
    ["-2", DURATION_NOT_POSITIVE],
  ])("refuses %j with %j", (input, error) => {
    expect(readDuration(input)).toEqual({ error });
    expect(parseDuration(input)).toBeNull();
  });

  it("words the minutes hint with the number typed", () => {
    expect(minutesHint(25)).toBe("Did you mean 25 minutes? Type 25m");
    expect(DURATION_NOT_POSITIVE).toBe("Enter more than 0, like 1:30");
    expect(DURATION_UNREADABLE).toBe("Couldn't read that duration. Try 1.5, 1:30 or 90m.");
  });

  // QA 2026-10-25: "+ 1 hour" then "+ 30 min" saved 0:30, because a different chip replaced the value.
  it.each([
    ["", 60, 0, 60], // empty box: the chip's own amount
    ["1h", 30, 60, 90], // "+ 1 hour" then "+ 30 min" = 1:30
    ["1:15", 30, 75, 105], // a typed time then a chip = 1:45
    ["2h", 120, 120, 240], // the same chip again still adds up
    ["abc", 60, 0, 60], // text that cannot be read: start from the chip's amount
    ["45", 30, 0, 30], // a bare "45" is refused with a hint (issue 435), so the chip replaces it
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
