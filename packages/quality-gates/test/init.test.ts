import { main } from "quality-gates";
import { afterAll, describe, expect, it } from "vitest";

import { cleanFixtures, fixture, run } from "./fixture";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

afterAll(cleanFixtures);

const EXISTING_HOOK = { matcher: "Edit", hooks: [{ type: "command", command: "npx biome check --write" }] };

describe("quality-gates init on a fresh project", () => {
  const project = fixture(
    {
      "package.json": JSON.stringify({ name: "app", scripts: { test: "vitest" } }),
      ".claude/settings.json": JSON.stringify({ hooks: { PostToolUse: [EXISTING_HOOK] } }),
    },
    { git: false },
  );

  it("a dry run says what it would do and writes nothing", async () => {
    const { code, out } = await run(main, project.dir, "init");
    expect(code).toBe(0);
    expect(out.split("\n")).toEqual([
      "create .githooks/pre-commit  (rules, Biome on staged files and tsc before each commit)",
      "create .githooks/pre-push  (the whole gate before each push)",
      "create .github/workflows/ci.yml  (CI runs the same gate)",
      "create quality-gates.config.mjs  (the starter config)",
      "update package.json  (adds the prepare and ci scripts)",
      "update .claude/settings.json  (Claude Code runs the rules when a turn ends)",
      "init: dry run, nothing written. Run `quality-gates init --write` to do it.",
    ]);
    expect(existsSync(join(project.dir, ".githooks"))).toBe(false);
    expect(JSON.parse(project.read("package.json")).scripts).toEqual({ test: "vitest" });
  });

  it("--write puts every piece in place and keeps what was there", async () => {
    expect((await run(main, project.dir, "init", "--write")).code).toBe(0);

    for (const hook of [".githooks/pre-commit", ".githooks/pre-push"]) {
      expect(statSync(join(project.dir, hook)).mode & 0o111).toBeTruthy(); // executable, or git ignores it
    }
    expect(project.read(".githooks/pre-commit")).toContain("npx quality-gates rules");
    expect(project.read(".githooks/pre-push")).toContain("npm run ci");
    expect(project.read(".github/workflows/ci.yml")).toContain("run: npm run ci");
    expect(project.read("quality-gates.config.mjs")).toContain('"no-ts-ignore": true');

    const pkg = JSON.parse(project.read("package.json"));
    expect(pkg.scripts).toEqual({
      test: "vitest",
      prepare: "git config core.hooksPath .githooks || true",
      ci: "quality-gates rules && biome check && tsc --noEmit && vitest run --coverage",
    });

    const settings = JSON.parse(project.read(".claude/settings.json"));
    expect(settings.hooks.PostToolUse).toEqual([EXISTING_HOOK]);
    expect(settings.hooks.Stop[0].hooks[0].command).toContain("npx quality-gates rules");
  });

  it("a second run changes nothing", async () => {
    const before = project.read(".claude/settings.json");
    const { out } = await run(main, project.dir, "init", "--write");
    expect(out.split("\n").filter((l) => !l.startsWith("skip"))).toEqual([
      "init: done. Run `npm install` (or `npm run prepare`) to switch the git hooks on.",
    ]);
    expect(project.read(".claude/settings.json")).toBe(before);
  });
});

describe("quality-gates init next to files it must not touch", () => {
  it("leaves an existing hook alone and creates package.json and settings when missing", async () => {
    const project = fixture({ ".githooks/pre-commit": "#!/bin/sh\nmake lint\n" }, { git: false });
    const { out } = await run(main, project.dir, "init", "--write");
    expect(out).toContain("skip   .githooks/pre-commit  (already there, left as it is)");
    expect(out).toContain("create package.json");
    expect(project.read(".githooks/pre-commit")).toBe("#!/bin/sh\nmake lint\n");
    expect(JSON.parse(project.read(".claude/settings.json")).hooks.Stop).toHaveLength(1);
  });

  it("keeps a project's own ci and prepare scripts", async () => {
    const scripts = { ci: "make ci", prepare: "husky" };
    const project = fixture({ "package.json": JSON.stringify({ scripts }) }, { git: false });
    const { out } = await run(main, project.dir, "init");
    expect(out).toContain("skip   package.json  (prepare and ci scripts already there)");
  });
});
