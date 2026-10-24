import { describe, expect, it } from "vitest";

import { PALETTE } from "@/lib/palette";

import { existsSync, readFileSync } from "node:fs";

/** The colour legend (docs/ui-spec.md) and the palette must not drift apart. */
const spec = readFileSync("docs/ui-spec.md", "utf8");

const names = Object.entries(PALETTE).flatMap(([key, value]) =>
  typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).map((k) => `PALETTE.${key}.${k}`)
    : [`PALETTE.${key}`],
);

describe("colour legend", () => {
  it("lists every palette colour by name", () => {
    for (const name of names) expect(spec, `${name} is missing from the legend`).toContain(name);
  });

  it("every palette colour is a real colour", () => {
    const all = Object.values(PALETTE)
      .flatMap((v) => (typeof v === "object" ? Object.values(v) : [v]))
      .flat();
    for (const c of all) expect(c).toMatch(/^(#[0-9a-f]{6}|color-mix\(.+\))$/i);
  });

  it("the guard's baseline names only files that still exist, and only counts that are positive", () => {
    const baseline = JSON.parse(readFileSync("scripts/colour-baseline.json", "utf8")) as Record<string, number>;
    for (const [file, n] of Object.entries(baseline)) {
      expect(existsSync(file), `${file} was deleted: run npm run check:colours -- --write`).toBe(true);
      expect(n).toBeGreaterThan(0);
    }
  });
});
