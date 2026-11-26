import { describe, expect, it } from "vitest";

import { formatDuration, parseDuration } from "@/lib/duration";
import {
  addChipTime,
  MAX_BARE_HOURS,
  MAX_ENTRY_MINUTES,
  minutesHint,
  readTypedDuration,
  TYPED_NOT_POSITIVE,
  TYPED_TOO_LONG,
  TYPED_UNREADABLE,
} from "@/lib/typed-duration";

describe("what a freelancer types in a time box", () => {
  it.each([
    ["2", 120], // a bare number is hours: "2" is never two minutes
    ["24", 1440],
    ["0.5", 30],
    ["1,5", 90], // a decimal comma, as many freelancers type it
    ["1,5h", 90],
    ["0,25", 15],
    ["25m", 25], // minutes need m
    ["90m", 90],
    ["1:30", 90],
    ["1h30", 90],
    [" 2 ", 120],
    [".5", 30],
    [".25", 15],
  ])("reads %j as %i minutes", (input, minutes) => {
    expect(readTypedDuration(input)).toEqual({ minutes });
  });

  it.each([
    // A bare whole number over 24 could be minutes: say how to type them instead of logging hours or guessing.
    ["25", "Did you mean 25 minutes? Type 25m"],
    // Over one entry's 24 hours, however it is typed.
    ["2000", "One entry can be up to 24 hours"],
    ["24.5", "One entry can be up to 24 hours"],
    ["30:00", "One entry can be up to 24 hours"],
    // Nothing to log, or less than nothing.
    ["0", "Enter more than 0, like 1:30"],
    ["0:00", "Enter more than 0, like 1:30"],
    ["0m", "Enter more than 0, like 1:30"],
    ["-2", "Enter more than 0, like 1:30"],
    ["-1:30", "Enter more than 0, like 1:30"],
    ["0.001", "Enter more than 0, like 1:30"],
    // A comma that is not one decimal point (a colon after it, a second separator, a thousands mark) is not read.
    ["abc", "Try 1.5, 1:30 or 90m"],
    ["1,5:30", "Try 1.5, 1:30 or 90m"],
    ["1,5,5", "Try 1.5, 1:30 or 90m"],
    ["1.5,5", "Try 1.5, 1:30 or 90m"],
    ["1,234", "Try 1.5, 1:30 or 90m"],
    ["-.5", "Enter more than 0, like 1:30"],
    [".", "Try 1.5, 1:30 or 90m"],
    ["-", "Try 1.5, 1:30 or 90m"],
  ])("refuses %j with %j", (input, error) => {
    expect(readTypedDuration(input)).toEqual({ error });
  });

  it.each(["", "   "])("says nothing for an empty box %j", (input) => {
    expect(readTypedDuration(input)).toEqual({});
  });

  it("names its limits and words", () => {
    expect(MAX_BARE_HOURS).toBe(24);
    expect(MAX_ENTRY_MINUTES).toBe(1440);
    expect(minutesHint(25)).toBe("Did you mean 25 minutes? Type 25m");
    expect([TYPED_NOT_POSITIVE, TYPED_TOO_LONG, TYPED_UNREADABLE]).toEqual([
      "Enter more than 0, like 1:30",
      "One entry can be up to 24 hours",
      "Try 1.5, 1:30 or 90m",
    ]);
  });

  it("leaves parseDuration's own rule to CSV, MCP and the server", () => {
    expect(parseDuration("2")).toBe(120);
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("30:00")).toBe(1800); // the server's entry limit refuses it, with its own words
  });
});

describe("quick-time chips add to the box", () => {
  // QA 2026-10-25: "+ 1 hour" then "+ 30 min" saved 0:30, because a different chip replaced the value.
  it.each([
    ["", 60, 0, 60], // empty box: the chip's own amount
    ["1h", 30, 60, 90], // "+ 1 hour" then "+ 30 min" = 1:30
    ["1:15", 30, 75, 105], // a typed time then a chip = 1:45
    ["2h", 120, 120, 240], // the same chip again still adds up
    ["2", 30, 120, 150], // a bare 2 is two hours, as the box shows
    ["abc", 60, 0, 60], // text that cannot be read: start from the chip's amount
    ["25", 30, 0, 30], // a bare 25 gets the minutes hint, so the chip replaces it
    ["0", 15, 0, 15],
  ])("a chip adds to %j: +%i → %i to %i", (current, chip, from, to) => {
    expect(addChipTime(current, chip)).toEqual({ from, to });
  });

  it("chips tapped one after another add up to the total a freelancer expects", () => {
    let box = "";
    for (const chip of [60, 30, 120]) box = formatDuration(addChipTime(box, chip).to);
    expect(box).toBe("3:30");
  });
});
