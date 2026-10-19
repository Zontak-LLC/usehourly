import { describe, expect, it } from "vitest";

import { dayDots } from "@/lib/week-dots";

const e = (date: string, minutes: number, name: string, color: string) => ({
  date,
  minutes,
  project: { client: { name, color } },
});

describe("the dots on the Week page's day tiles", () => {
  it("shows one dot per client that has time that day, the biggest first, and nothing for an empty day", () => {
    const dots = dayDots([
      e("2026-10-19", 30, "Acme", "#111111"),
      e("2026-10-19", 90, "Beta", "#222222"),
      e("2026-10-19", 60, "Acme", "#111111"), // Acme: 90 in all, tied with Beta; first seen wins the tie
      e("2026-10-20", 45, "Acme", "#111111"),
    ]);
    expect(dots["2026-10-19"]).toEqual(["#111111", "#222222"]);
    expect(dots["2026-10-20"]).toEqual(["#111111"]);
    expect(dots["2026-10-21"]).toBeUndefined(); // no entries, no dot
  });

  it("never shows more than three dots, keeping the clients with the most time", () => {
    const many = ["A", "B", "C", "D", "E"].map((n, i) => e("2026-10-19", 10 * (i + 1), n, `#00000${i}`));
    expect(dayDots(many)).toEqual({ "2026-10-19": ["#000004", "#000003", "#000002"] });
    expect(dayDots(many, 2)["2026-10-19"]).toHaveLength(2);
    expect(dayDots([])).toEqual({});
  });
});
