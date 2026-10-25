import { describe, expect, it } from "vitest";

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * One-off helpers live in scripts/.tmp-*. Git must ignore them (so they are never committed by accident) and Biome
 * must skip them (it reads .gitignore through the shared preset), so a leftover helper never breaks the lint.
 * `--no-index` checks the pattern even when no such file exists.
 */
const ignored = (path: string) =>
  spawnSync("git", ["check-ignore", "-q", "--no-index", path], { cwd: process.cwd() }).status;

describe("scratch scripts", () => {
  it("git ignores scripts/.tmp-* files", () => {
    expect(ignored("scripts/.tmp-x.mjs")).toBe(0);
  });

  it("git still tracks real scripts", () => {
    expect(ignored("scripts/load-check.mjs")).toBe(1);
  });

  it("Biome skips git-ignored files", () => {
    const preset = JSON.parse(readFileSync(join(process.cwd(), "packages/quality-gates/biome.preset.json"), "utf8"));
    expect(preset.vcs.enabled).toBe(true);
    expect(preset.vcs.useIgnoreFile).toBe(true);
  });
});
