// The rules runner: rules a linter cannot express, checked line by line with plain text search.
// Each finding is file:line and why. A line is exempt with `check-rules-ok: <reason>` or a Biome suppression (with its
// reason) on it or on the line above; a marker without a reason exempts nothing and is a finding itself.

import { exemptionMatcher } from "./exemptions.mjs";
import { listFiles, matchesAny } from "./files.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TEST_FILES = ["**/__tests__/**", "**/*.test.*", "**/*.spec.*", "e2e/**"];

/**
 * The built-in rules, in the order findings are reported. Each can be turned off (`false`) or given options in the
 * config: `only` / `skip` (path globs), `message`; `no-raw-header` also takes `header` and is off until it has one.
 * The lines below that spell out a rule's own pattern are exempt from that rule, as any line can be.
 */
export const BUILTIN_RULES = {
  "no-ts-ignore": {
    // check-rules-ok: the rule's own message names what it forbids
    message: "no @ts-ignore / @ts-nocheck (use @ts-expect-error with a reason)",
    pattern: /@ts-(ignore|nocheck)/,
  },
  "no-double-cast": {
    // check-rules-ok: the rule's own message names what it forbids
    message: "no `as unknown as` double casts in app code",
    // check-rules-ok: the rule's own pattern
    pattern: /\bas unknown as\b/,
    skip: ["**/__tests__/**", "**/*.test.*"],
  },
  "todo-needs-issue": {
    // check-rules-ok: the rule's own message names what it forbids
    message: "TODO/FIXME/HACK must name an issue, e.g. TODO(#41)",
    // check-rules-ok: the rule's own pattern
    pattern: /\b(TODO|FIXME|HACK)\b(?!\(#\d+\))/,
  },
  "no-raw-header": {
    message: (/** @type {{ header: string }} */ o) => `read ${o.header} through one helper, never directly`,
    pattern: (/** @type {{ header: string }} */ o) => new RegExp(o.header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    off: true,
  },
  "no-only": {
    message: "no .only, no unconditional .skip in tests",
    pattern: /\b(it|test|describe)\.only\(|\b(it|test|describe)\.skip\(\s*["'`]/,
    only: TEST_FILES,
  },
  "no-inner-html": {
    // check-rules-ok: the rule's own message names what it forbids
    message: "no dangerouslySetInnerHTML",
    // check-rules-ok: the rule's own pattern
    pattern: /dangerouslySetInnerHTML/,
  },
  "no-eval": { message: "no eval / new Function", pattern: /\beval\(|new Function\(/ },
};

/**
 * The rules a config turns on, built-ins first (in their order), then the project's own (`custom`).
 * @param {{ rules?: Record<string, boolean | Record<string, unknown>>, custom?: Array<Record<string, unknown>> }} config
 */
export function resolveRules(config = {}) {
  const chosen = config.rules ?? {};
  for (const name of Object.keys(chosen)) {
    if (!(name in BUILTIN_RULES))
      throw new Error(`quality-gates: unknown rule "${name}" (known: ${Object.keys(BUILTIN_RULES).join(", ")})`);
  }
  const rules = [];
  for (const [name, base] of Object.entries(BUILTIN_RULES)) {
    const setting = chosen[name];
    if (setting === false || (base.off && !setting)) continue;
    const opts = { ...base, ...(typeof setting === "object" ? setting : {}) };
    const message = typeof opts.message === "function" ? opts.message(opts) : opts.message;
    const pattern = typeof opts.pattern === "function" ? opts.pattern(opts) : opts.pattern;
    rules.push({ name, message, pattern, only: opts.only, skip: opts.skip });
  }
  for (const c of config.custom ?? []) {
    if (!(c.pattern instanceof RegExp) || typeof c.message !== "string") {
      throw new Error("quality-gates: a custom rule needs a `message` (string) and a `pattern` (RegExp)");
    }
    rules.push({ name: c.name ?? c.message, message: c.message, pattern: c.pattern, only: c.only, skip: c.skip });
  }
  return rules;
}

/**
 * Check the given files. Returns findings in file, line, rule order.
 * @param {{ cwd?: string, files: string[], rules: ReturnType<typeof resolveRules>, marker?: string }} opts
 */
export function checkRules({ cwd = process.cwd(), files, rules, marker = "check-rules-ok" }) {
  const ex = exemptionMatcher(marker, { biome: true });
  /** @type {{ file: string, line: number, rule: string, message: string }[]} */
  const findings = [];
  for (const file of files) {
    const active = rules.filter((r) => (!r.only || matchesAny(file, r.only)) && !matchesAny(file, r.skip));
    const lines = readFileSync(join(cwd, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (ex.kind(line) === "no-reason") {
        findings.push({
          file,
          line: i + 1,
          rule: "exemption-reason",
          message: `${marker}: needs a reason after the colon`,
        });
      }
      if (ex.exempt(lines, i)) return;
      for (const r of active) {
        if (r.pattern.test(line)) findings.push({ file, line: i + 1, rule: r.name, message: r.message });
      }
    });
  }
  return findings;
}

/**
 * The `rules` command: list the files from the config, check them, and say what was found.
 * @param {{ cwd?: string, config: Record<string, any> }} opts
 */
export function runRules({ cwd = process.cwd(), config }) {
  const f = config.files ?? {};
  const files = listFiles({
    cwd,
    include: f.include ?? ["."],
    extensions: f.extensions ?? ["ts", "tsx", "js", "jsx", "mjs", "cjs"],
    exclude: f.exclude ?? [],
  });
  const rules = resolveRules(config);
  const findings = checkRules({ cwd, files, rules, marker: config.marker });
  const report = findings.length
    ? `${findings.length} rule violation(s):\n${findings.map((x) => `${x.file}:${x.line}  ${x.message}`).join("\n")}`
    : `rules: ${files.length} files, ${rules.length} rules, clean`;
  return { ok: findings.length === 0, findings, report };
}
