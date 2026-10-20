import { describe, expect, it, vi } from "vitest";

import { PREFERENCE_DEFAULTS, PREFERENCE_REGISTRY, parsePreference } from "@/lib/preferences/preferences-config";

// The font list pulls in next/font, which only loads inside Next: the navigation settings do not depend on it.
vi.mock("@/lib/fonts/registry", () => ({ fontKeys: ["geist"], fontOptions: [] }));

describe("where the main navigation sits on a wide screen", () => {
  it("starts down the left on a wide screen, with words next to the icons, until someone chooses otherwise", () => {
    expect(PREFERENCE_DEFAULTS.nav_position).toBe("left");
    expect(PREFERENCE_DEFAULTS.nav_collapsed).toBe("open");
  });

  it("is saved in a cookie and put on <html> before the page paints, from fixed attribute names the styles rely on", () => {
    expect(PREFERENCE_REGISTRY.nav_position).toMatchObject({
      persistence: "client-cookie",
      attribute: "data-nav-position",
    });
    expect(PREFERENCE_REGISTRY.nav_collapsed).toMatchObject({
      persistence: "client-cookie",
      attribute: "data-nav-collapsed",
    });
  });

  it("only accepts the known values: anything else in a cookie falls back to the default", () => {
    expect(parsePreference("nav_position", "left")).toBe("left");
    expect(parsePreference("nav_position", "top")).toBe("top"); // a saved choice of Top is kept
    expect(parsePreference("nav_position", "right")).toBe("left");
    expect(parsePreference("nav_position", "<script>")).toBe("left");
    expect(parsePreference("nav_position", null)).toBe("left");
    expect(parsePreference("nav_collapsed", "collapsed")).toBe("collapsed");
    expect(parsePreference("nav_collapsed", "tiny")).toBe("open");
  });
});
