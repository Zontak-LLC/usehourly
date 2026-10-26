import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

/** Night Watch triage reads docs/operations.md to close known noise; the entry must stay exact. */
const ops = readFileSync("docs/operations.md", "utf8");
const section = ops.split("\n### Known log noise\n")[1]?.split(/\n## /)[0] ?? "";

describe("known log noise (incident usehourly:b9180f8241326666)", () => {
  it("has a Known log noise section", () => {
    expect(section, "docs/operations.md has no '### Known log noise' section").not.toBe("");
  });

  it("names the exact stack signature, not just Object.get", () => {
    expect(section).toContain("at Object.get");
    expect(section).toContain("o8.handleResponse");
    for (const frame of ["`rD`", "`r$`", "`sg`", "`sy`"]) expect(section).toContain(frame);
  });

  it("holds the warning text, the source module and an upstream link", () => {
    expect(section).toContain("Failed to find Server Action");
    expect(section).toContain("This request might be from an older or newer deployment.");
    expect(section).toContain("manifests-singleton.js");
    expect(section).toMatch(/Next\.js \d+\.\d+\.\d+/);
    expect(section).toMatch(/Upstream: https:\/\/nextjs\.org\/\S+/);
  });

  it("tells triage what to do", () => {
    expect(section).toContain("Night Watch triage: close as known noise");
  });
});
