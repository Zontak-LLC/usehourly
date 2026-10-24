import { BUILTIN_RULES, checkRules, globToRegExp, main, resolveRules, runRules } from "quality-gates";
import { afterAll, describe, expect, it } from "vitest";

import { cleanFixtures, fixture, run } from "./fixture";

afterAll(cleanFixtures);

// The planted lines spell out what the rules forbid, so each one carries an exemption for THIS repository's own check.
const MARK = "check-rules-ok";
const EVAL = ["ev", "al"].join("");
const PLANTED = [
  "export const ok = 1;",
  // check-rules-ok: planted for the test
  "// @ts-ignore",
  // check-rules-ok: planted for the test
  "const a = 1 as unknown as string;",
  // check-rules-ok: planted for the test
  "// TODO tidy this",
  "// TODO(#41) names its issue, so it is fine",
  "const h = req.headers.get('X-Real-Client');",
  // check-rules-ok: planted for the test
  "const d = { dangerouslySetInnerHTML: 1 };",
  `${EVAL}("1");`,
  `// ${MARK}: the reason is right here`,
  `${EVAL}("2");`,
  `// ${MARK}:`,
  `${EVAL}("3");`,
  "// biome-ignore lint/suspicious/noExplicitAny: a reason Biome also wants",
  `${EVAL}("4");`,
].join("\n");

// check-rules-ok: planted for the test
const PLANTED_TEST = ['it.only("one", () => {});', 'describe.skip("all", () => {});', "it.skip(name, fn);"].join("\n");

const CONFIG = `export default {
  files: { include: ["src"], extensions: ["ts"] },
  rules: { "no-raw-header": { header: "x-real-client" }, "no-double-cast": { only: ["src/app/**"] } },
  custom: [{ message: "say colour, not color", pattern: /\\bcolor\\b/, skip: ["src/vendor/**"] }],
};
`;

describe("a project runs its rules", () => {
  const project = fixture({
    "quality-gates.config.mjs": CONFIG,
    "src/app/planted.ts": PLANTED,
    "src/app/planted.test.ts": PLANTED_TEST,
    "src/lib/cast.ts": "export const c = 1 as unknown as string;\n",
    "src/app/words.ts": "export const color = 'blue';\n",
    "src/vendor/words.ts": "export const color = 'blue';\n",
    "src/notes.md": `${EVAL}(1)\n`,
  });

  it("names every planted violation by file and line, and nothing else", async () => {
    const { code, err } = await run(main, project.dir, "rules");
    expect(code).toBe(1);
    expect(err.split("\n")).toEqual([
      "11 rule violation(s):",
      "src/app/planted.test.ts:1  no .only, no unconditional .skip in tests",
      "src/app/planted.test.ts:2  no .only, no unconditional .skip in tests",
      // check-rules-ok: the expected report quotes the rule
      "src/app/planted.ts:2  no @ts-ignore / @ts-nocheck (use @ts-expect-error with a reason)",
      "src/app/planted.ts:3  no `as unknown as` double casts in app code",
      // check-rules-ok: the expected report quotes the rule
      "src/app/planted.ts:4  TODO/FIXME/HACK must name an issue, e.g. TODO(#41)",
      "src/app/planted.ts:6  read x-real-client through one helper, never directly",
      // check-rules-ok: the expected report quotes the rule
      "src/app/planted.ts:7  no dangerouslySetInnerHTML",
      "src/app/planted.ts:8  no eval / new Function",
      // An exemption without a reason is refused, and the line under it is still checked.
      "src/app/planted.ts:11  check-rules-ok: needs a reason after the colon",
      "src/app/planted.ts:12  no eval / new Function",
      "src/app/words.ts:1  say colour, not color",
    ]);
  });

  it("applies a rule only where its globs say: the cast outside src/app and the vendored word pass", () => {
    const { findings } = runRules({ cwd: project.dir, config: { files: { include: ["src"], extensions: ["ts"] } } });
    // With no rules chosen every built-in is on with its defaults (no-raw-header stays off without a header).
    expect(findings.some((f) => f.file === "src/lib/cast.ts")).toBe(true);
    expect(findings.some((f) => f.message.includes("x-real-client"))).toBe(false);
  });

  it("reports the custom rule only outside its skip glob", () => {
    const { findings } = runRules({
      cwd: project.dir,
      config: {
        files: { include: ["src"], extensions: ["ts"] },
        rules: Object.fromEntries(Object.keys(BUILTIN_RULES).map((r) => [r, false])),
        custom: [{ message: "say colour", pattern: /\bcolor\b/, skip: ["src/vendor/**"] }],
      },
    });
    // The reasonless exemption is reported whatever rules are on.
    expect(findings.map((f) => `${f.file}:${f.line} ${f.rule}`)).toEqual([
      "src/app/planted.ts:11 exemption-reason",
      "src/app/words.ts:1 say colour",
    ]);
  });
});

describe("a clean project", () => {
  it("passes and says how much it looked at", async () => {
    const project = fixture({ "src/a.ts": "export const a = 1;\n", "src/b.mjs": "export const b = 2;\n" });
    const { code, out } = await run(main, project.dir, "rules");
    expect(code).toBe(0);
    expect(out).toBe("rules: 2 files, 6 rules, clean");
  });

  it("skips a file git lists but that was deleted from disk", async () => {
    const project = fixture({ "src/a.ts": "export const a = 1;\n", "src/gone.ts": `${EVAL}("x");\n` });
    const { rmSync } = await import("node:fs");
    rmSync(`${project.dir}/src/gone.ts`);
    expect((await run(main, project.dir, "rules")).code).toBe(0);
  });
});

describe("a config with a mistake is refused, not silently ignored", () => {
  it("an unknown rule name", () => {
    expect(() => resolveRules({ rules: { "no-typo": true } })).toThrow(/unknown rule "no-typo"/);
  });

  it("a custom rule without a pattern", () => {
    expect(() => resolveRules({ custom: [{ message: "x" }] })).toThrow(/needs a `message`/);
  });

  it("an unknown command prints the usage", async () => {
    const { dir } = fixture({});
    expect(await run(main, dir, "lint")).toMatchObject({ code: 1, err: expect.stringContaining("usage:") });
    expect((await run(main, dir)).code).toBe(0);
  });
});

describe("exemptions", () => {
  it("a Biome suppression without a reason does not exempt", () => {
    const project = fixture({ "src/x.ts": ["// biome-ignore lint/x:", `${EVAL}("1");`].join("\n") }, { git: false });
    const findings = checkRules({ cwd: project.dir, files: ["src/x.ts"], rules: resolveRules({}) });
    expect(findings.map((f) => f.line)).toEqual([2]);
  });

  it("a JSX comment with a reason exempts the next line", () => {
    const text = [`{/* ${MARK}: a planted example */}`, `${EVAL}("1");`, `{/* ${MARK}: */}`].join("\n");
    const project = fixture({ "src/x.tsx": text }, { git: false });
    const findings = checkRules({ cwd: project.dir, files: ["src/x.tsx"], rules: resolveRules({}) });
    expect(findings.map((f) => `${f.line} ${f.rule}`)).toEqual(["3 exemption-reason"]);
  });
});

describe("path globs", () => {
  it.each([
    ["src/**", "src/a/b.ts", true],
    ["src/**", "lib/a.ts", false],
    ["**/__tests__/**", "src/__tests__/a.ts", true],
    ["**/__tests__/**", "__tests__/a.ts", true],
    ["**/*.test.*", "src/a.test.ts", true],
    ["**/*.test.*", "src/a.ts", false],
    ["src/*.ts", "src/a/b.ts", false],
    ["src/?.ts", "src/a.ts", true],
    ["a.b/**", "axb/c", false],
  ])("%s matches %s: %s", (glob, file, expected) => {
    expect(globToRegExp(glob).test(file)).toBe(expected);
  });
});
