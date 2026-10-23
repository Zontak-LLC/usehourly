import { describe, expect, it } from "vitest";

import nextConfig, { NIGHT_SHIFT_URL } from "../../next.config.mjs";

describe("usehourly.app/nightshift", () => {
  it("sends visitors to the Claude Night Shift board with a temporary redirect, and never redirects the home page", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    const night = rules.find((r) => r.source === "/nightshift");
    expect(night).toMatchObject({ destination: NIGHT_SHIFT_URL, permanent: false });
    expect(NIGHT_SHIFT_URL).toMatch(/^https:\/\/claude\.ai\/artifact\/\w+$/);
    expect(rules.some((r) => r.source === "/")).toBe(false); // "/" is the landing page (CLAUDE.md)
  });
});
