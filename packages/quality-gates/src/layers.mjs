// Layering rules, checked from the import lines, for a project's architecture test:
//   expect(checkLayers({ files, rules: [libRule] })).toEqual([]);
// A violation names the file and the import (or the forbidden text), so a failing test says what to move.

import { matchesAny } from "./files.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const IMPORT = /^\s*(?:import(?!\s+type\b)|export)\s[^;]*?from\s+["']([^"']+)["']/gm;

/**
 * The modules a file imports or re-exports at runtime (`import type` lines are left out: they vanish at build time).
 * @param {string} text
 */
export function importsOf(text) {
  return [...text.matchAll(IMPORT)].map((m) => /** @type {string} */ (m[1]));
}

/**
 * @typedef {object} LayerRule
 * @property {string} name what the rule protects, for the report
 * @property {RegExp | string[]} from the files the rule applies to (a path RegExp or globs)
 * @property {RegExp | string[]} [except] files it does not apply to
 * @property {RegExp} [when] only files whose text matches (e.g. /"use client"/)
 * @property {RegExp} [banned] modules those files may not import
 * @property {RegExp} [pattern] text those files may not contain (e.g. /new PrismaClient\(/)
 */

/**
 * @param {{ cwd?: string, files: string[], rules: LayerRule[] }} opts
 * @returns {{ rule: string, file: string, found: string, message: string }[]}
 */
export function checkLayers({ cwd = process.cwd(), files, rules }) {
  const out = [];
  for (const rule of rules) {
    if (!rule.banned && !rule.pattern)
      throw new Error(`quality-gates: layer rule "${rule.name}" needs banned or pattern`);
    for (const file of files) {
      if (!matchesAny(file, rule.from) || matchesAny(file, rule.except)) continue;
      const text = readFileSync(join(cwd, file), "utf8");
      if (rule.when && !rule.when.test(text)) continue;
      const banned = rule.banned;
      if (banned) {
        for (const i of importsOf(text).filter((m) => banned.test(m))) {
          out.push({ rule: rule.name, file, found: i, message: `${file} imports ${i}` });
        }
      }
      if (rule.pattern?.test(text)) {
        out.push({ rule: rule.name, file, found: String(rule.pattern), message: `${file} contains ${rule.pattern}` });
      }
    }
  }
  return out;
}
