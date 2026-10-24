// The command line: quality-gates rules | colours [--write] | init [--write]

import { runColours } from "./colours.mjs";
import { applyInit, planInit } from "./init.mjs";
import { runRules } from "./rules.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const CONFIG_FILE = "quality-gates.config.mjs";

const USAGE = `usage: quality-gates <command>
  rules              check the project rules (quality-gates.config.mjs)
  colours [--write]  the colour ratchet; --write records lower counts (never higher ones)
  init [--write]     set up git hooks, the ci script, the Claude Code hook and a CI workflow (dry run without --write)`;

/** @param {string} cwd */
export async function loadConfig(cwd) {
  const p = join(cwd, CONFIG_FILE);
  if (!existsSync(p)) return {};
  const mod = await import(pathToFileURL(p).href);
  return mod.default ?? {};
}

/**
 * Run one command. Returns the exit code; output goes through `out` and `err`.
 * @param {string[]} argv
 * @param {{ cwd?: string, out: (s: string) => void, err: (s: string) => void }} io
 */
export async function main(argv, { cwd = process.cwd(), out, err }) {
  const [command, ...rest] = argv;
  const write = rest.includes("--write");
  if (command === "rules" || command === "colours") {
    const config = await loadConfig(cwd);
    const result = command === "rules" ? runRules({ cwd, config }) : runColours({ cwd, config, write });
    (result.ok ? out : err)(result.report);
    return result.ok ? 0 : 1;
  }
  if (command === "init") {
    const steps = planInit(cwd);
    for (const s of steps) out(`${s.action.padEnd(6)} ${s.path}  (${s.why})`);
    if (write) {
      applyInit(cwd, steps);
      out("init: done. Run `npm install` (or `npm run prepare`) to switch the git hooks on.");
    } else out("init: dry run, nothing written. Run `quality-gates init --write` to do it.");
    return 0;
  }
  err(USAGE);
  return command ? 1 : 0;
}
