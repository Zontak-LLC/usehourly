import { colourIncreases, coverageFloor, main, runColours } from "quality-gates";
import { afterAll, describe, expect, it } from "vitest";

import { cleanFixtures, fixture, run } from "./fixture";

afterAll(cleanFixtures);

const CONFIG = `export default {
  colours: { include: ["src"], extensions: ["ts"], exclude: ["src/palette.ts"], baseline: "colour-baseline.json" },
};
`;

describe("the colour ratchet over a project's life", () => {
  const project = fixture({
    "quality-gates.config.mjs": CONFIG,
    "src/card.ts": 'export const card = ["#ff0000", "#00f", "#abcdef"];\n',
    "src/palette.ts": 'export const ink = "#12151b";\n',
    "src/links.ts": 'export const tab = "#add"; // a URL fragment, not a colour\n',
    "src/ok.ts": ["// colour-ok: the brand colour, approved", 'export const brand = "#123456";'].join("\n"),
    "src/notes.ts": ["// colour-ok:", 'export const x = "#654321";'].join("\n"),
  });

  it("the first --write records what is there (the palette and exempt lines are not counted)", async () => {
    expect(await run(main, project.dir, "colours", "--write")).toMatchObject({
      code: 0,
      out: "colours: wrote 2 files",
    });
    // An exemption without a reason exempts nothing: notes.ts still counts.
    expect(JSON.parse(project.read("colour-baseline.json"))).toEqual({ "src/card.ts": 3, "src/notes.ts": 1 });
    expect(await run(main, project.dir, "colours")).toMatchObject({ code: 0, out: "colours: 4 files, no new colours" });
  });

  it("refuses a file that gains a colour, and a new file that starts using them", async () => {
    project.write("src/card.ts", 'export const card = ["#ff0000", "#00f", "#abcdef", "#fff"];\n');
    project.write("src/new.ts", 'export const n = "#000";\n');
    const { code, err } = await run(main, project.dir, "colours");
    expect(code).toBe(1);
    expect(err.split("\n")).toEqual([
      "colours: 2 problems",
      "src/card.ts: 4 hard-coded colours, 3 allowed. Use a theme token or a named palette colour instead.",
      "src/new.ts: 1 hard-coded colours, 0 allowed. Use a theme token or a named palette colour instead.",
    ]);
  });

  it("--write will not raise the baseline to hide an increase", async () => {
    const { code, err } = await run(main, project.dir, "colours", "--write");
    expect(code).toBe(1);
    expect(err).toContain("refusing to raise the baseline");
    expect(JSON.parse(project.read("colour-baseline.json"))).toEqual({ "src/card.ts": 3, "src/notes.ts": 1 });
  });

  it("--write lowers the baseline once colours are removed", async () => {
    project.write("src/card.ts", 'export const card = ["#ff0000"];\n');
    project.write("src/new.ts", "export const n = 0;\n");
    expect((await run(main, project.dir, "colours", "--write")).code).toBe(0);
    expect(JSON.parse(project.read("colour-baseline.json"))).toEqual({ "src/card.ts": 1, "src/notes.ts": 1 });
  });
});

describe("colour ratchet details", () => {
  it("is off until configured", () => {
    const { dir } = fixture({});
    expect(runColours({ cwd: dir, config: {} })).toMatchObject({
      ok: true,
      report: expect.stringContaining("not configured"),
    });
  });

  it("uses its own hint and says one problem in the singular", () => {
    const project = fixture({ "src/a.ts": 'export const a = "#fff";\n' });
    const result = runColours({ cwd: project.dir, config: { colours: { hint: "Use the palette." } } });
    expect(result).toEqual({
      ok: false,
      report: "colours: 1 problem\nsrc/a.ts: 1 hard-coded colours, 0 allowed. Use the palette.",
    });
  });

  it("compares counts with the baseline", () => {
    expect(colourIncreases({ a: 2, b: 1 }, { a: 2 })).toEqual([{ file: "b", count: 1, allowed: 0 }]);
  });
});

describe("the coverage floor for vitest", () => {
  it("passes the thresholds through with v8 and the summary reporters", () => {
    const thresholds = { statements: 87, branches: 82, functions: 90, lines: 88 };
    expect(coverageFloor({ thresholds, include: ["src/**"] })).toEqual({
      provider: "v8",
      include: ["src/**"],
      exclude: undefined,
      reporter: ["text-summary", "json-summary"],
      thresholds,
    });
  });

  it("refuses a floor that is not a percentage", () => {
    expect(() => coverageFloor({ thresholds: { statements: 87, branches: 820, functions: 90, lines: 88 } })).toThrow(
      /"branches" must be a number from 0 to 100/,
    );
  });
});
