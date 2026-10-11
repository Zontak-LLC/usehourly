import { describe, expect, it } from "vitest";

import { formatDuration, parseDuration } from "@/lib/duration";

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

  it("formats minutes as h:mm", () => {
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(5)).toBe("0:05");
  });
});
