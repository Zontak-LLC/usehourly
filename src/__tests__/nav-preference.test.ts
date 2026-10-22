import { describe, expect, it, vi } from "vitest";

import { PREFERENCE_DEFAULTS, PREFERENCE_REGISTRY, parsePreference } from "@/lib/preferences/preferences-config";

// The font list pulls in next/font, which only loads inside Next: the navigation settings do not depend on it.
vi.mock("@/lib/fonts/registry", () => ({ fontKeys: ["geist"], fontOptions: [] }));

describe("where the main navigation sits on a wide screen", () => {
  it("starts as a pill of tabs in the top bar (the 2026-10-22 look) until someone chooses the left menu", () => {
    expect(PREFERENCE_DEFAULTS.nav_position).toBe("top");
  });

  it("has no icons-only mode any more: the old collapse choice is gone from the registry", () => {
    expect(Object.keys(PREFERENCE_REGISTRY)).not.toContain("nav_collapsed");
  });

  it("is saved in a cookie and put on <html> before the page paints, from fixed attribute names the styles rely on", () => {
    expect(PREFERENCE_REGISTRY.nav_position).toMatchObject({
      persistence: "client-cookie",
      attribute: "data-nav-position",
    });
  });

  it("only accepts the known values: anything else in a cookie falls back to the default", () => {
    expect(parsePreference("nav_position", "left")).toBe("left"); // a saved choice of Left is kept
    expect(parsePreference("nav_position", "top")).toBe("top");
    expect(parsePreference("nav_position", "right")).toBe("top");
    expect(parsePreference("nav_position", "<script>")).toBe("top");
    expect(parsePreference("nav_position", null)).toBe("top");
  });
});
