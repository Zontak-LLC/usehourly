// `quality-gates init`: set a project up so the same checks run before a commit, before a push, in CI and when a
// Claude Code turn ends. Dry run by default (it says what it would do); `--write` does it. It never overwrites a file
// that is there: it skips it and says so, except package.json and .claude/settings.json, which it adds to.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const GATE = "quality-gates rules && biome check && tsc --noEmit && vitest run --coverage";
const STOP_HOOK = 'cd "$CLAUDE_PROJECT_DIR" && npx quality-gates rules 2>&1 | tail -15; exit 0';

const PRE_COMMIT = `#!/bin/sh
# Fast checks before a commit (written by quality-gates init). The full gate is \`npm run ci\`.
set -e
npx quality-gates rules
npx biome check --staged --no-errors-on-unmatched
npx tsc --noEmit
`;

const PRE_PUSH = `#!/bin/sh
# Run exactly what CI runs before anything leaves this machine (written by quality-gates init).
npm run ci
`;

const WORKFLOW = `name: CI

permissions:
  contents: read

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      # One definition of "the checks": the same command the pre-push hook runs.
      - run: npm run ci
`;

const CONFIG = `// quality-gates: which rules run, on which files. Each built-in rule can be false (off) or take options:
// only / skip (path globs) and message. Your own rules go in custom: { message, pattern, only?, skip? }.
export default {
  files: { include: ["src"], extensions: ["ts", "tsx", "js", "jsx", "mjs"] },
  rules: {
    "no-ts-ignore": true,
    "no-double-cast": { only: ["src/**"] },
    "todo-needs-issue": true,
    "no-only": true,
    "no-inner-html": true,
    "no-eval": true,
    // "no-raw-header": { header: "x-forwarded-for", message: "read the client address with one helper" },
  },
  custom: [],
  // The colour ratchet: hard-coded hex colours per file may only go down.
  // colours: { include: ["src"], extensions: ["ts", "tsx"], baseline: "colour-baseline.json" },
};
`;

/** @param {string} cwd */
function readJson(cwd, file) {
  const p = join(cwd, file);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined;
}

/**
 * What init would do in `cwd`: one step per file, `create`, `update` or `skip`, with the content to write.
 * @param {string} cwd
 * @returns {{ path: string, action: "create" | "update" | "skip", why: string, content?: string, mode?: number }[]}
 */
export function planInit(cwd) {
  const steps = [];
  const file = (path, content, why, mode) =>
    existsSync(join(cwd, path))
      ? steps.push({ path, action: /** @type {const} */ ("skip"), why: "already there, left as it is" })
      : steps.push({ path, action: /** @type {const} */ ("create"), why, content, mode });

  file(".githooks/pre-commit", PRE_COMMIT, "rules, Biome on staged files and tsc before each commit", 0o755);
  file(".githooks/pre-push", PRE_PUSH, "the whole gate before each push", 0o755);
  file(".github/workflows/ci.yml", WORKFLOW, "CI runs the same gate", undefined);
  file("quality-gates.config.mjs", CONFIG, "the starter config", undefined);

  const pkg = readJson(cwd, "package.json") ?? {};
  const scripts = { ...(pkg.scripts ?? {}) };
  const added = [];
  if (!scripts.prepare) {
    scripts.prepare = "git config core.hooksPath .githooks || true";
    added.push("prepare");
  }
  if (!scripts.ci) {
    scripts.ci = GATE;
    added.push("ci");
  }
  steps.push(
    added.length
      ? {
          path: "package.json",
          action: /** @type {const} */ (existsSync(join(cwd, "package.json")) ? "update" : "create"),
          why: `adds the ${added.join(" and ")} script${added.length > 1 ? "s" : ""}`,
          content: `${JSON.stringify({ ...pkg, scripts }, null, 2)}\n`,
        }
      : { path: "package.json", action: /** @type {const} */ ("skip"), why: "prepare and ci scripts already there" },
  );

  const settings = readJson(cwd, ".claude/settings.json") ?? {};
  const stop = settings.hooks?.Stop ?? [];
  if (JSON.stringify(stop).includes("quality-gates rules")) {
    steps.push({ path: ".claude/settings.json", action: "skip", why: "the Stop hook already runs the rules" });
  } else {
    const next = {
      ...settings,
      hooks: { ...settings.hooks, Stop: [...stop, { hooks: [{ type: "command", command: STOP_HOOK }] }] },
    };
    steps.push({
      path: ".claude/settings.json",
      action: existsSync(join(cwd, ".claude/settings.json")) ? "update" : "create",
      why: "Claude Code runs the rules when a turn ends",
      content: `${JSON.stringify(next, null, 2)}\n`,
    });
  }
  return steps;
}

/**
 * Carry out a plan.
 * @param {string} cwd @param {ReturnType<typeof planInit>} steps
 */
export function applyInit(cwd, steps) {
  for (const s of steps) {
    if (s.action === "skip" || s.content === undefined) continue;
    const p = join(cwd, s.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, s.content);
    if (s.mode) chmodSync(p, s.mode);
  }
}
