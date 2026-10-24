import { describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

// next/font only works inside Next: a stand-in gives the CSS variable class it would give.
vi.mock("next/font/google", () => ({
  JetBrains_Mono: (opts: { variable: string }) => ({ variable: `${opts.variable}-class` }),
}));

import { fontKeys, fontVars, SYSTEM_FONT_STACK } from "@/lib/fonts/registry";
import { PREFERENCE_DEFAULTS, parsePreference } from "@/lib/preferences/preferences-config";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("fonts: the system stack for text, JetBrains Mono for numbers", () => {
  it("text and headings default to the system stack (SF Pro on Apple), with nothing to download", () => {
    expect(SYSTEM_FONT_STACK).toBe('system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif');
    expect(css).toContain(`--font-system: ${SYSTEM_FONT_STACK};`);
    expect(css).toMatch(/--font-sans: var\(--font-system\);/);
    expect(css).toMatch(/--font-display: var\(--font-system\);/);
    expect(PREFERENCE_DEFAULTS.font).toBe("system");
  });

  it("times and money stay on JetBrains Mono, and it is the only font loaded", () => {
    expect(css).toMatch(/--font-mono: var\(--font-jetbrains-mono\)/);
    expect(fontVars).toBe("--font-jetbrains-mono-class");
  });

  it("the home page has no font of its own, and the old faces are gone", () => {
    expect(css).not.toMatch(/data-landing-page\]\)\s*\{\s*--font-sans/);
    expect(css).not.toMatch(/instrument-sans|bricolage|font-geist/);
  });

  it("an old font cookie is ignored, so everyone gets the new default", () => {
    expect(fontKeys).toEqual(["system"]);
    for (const old of ["instrumentSans", "bricolage", "geist", "inter"]) {
      expect(parsePreference("font", old)).toBe("system");
    }
  });
});
