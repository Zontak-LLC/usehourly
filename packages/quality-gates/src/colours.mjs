// The colour ratchet (optional): the number of hard-coded hex colours in each file may only go down. The counts live
// in a baseline JSON file; a file may not gain colours over its count, and a file with none may not start.
// `--write` records the current counts, and only when no file went up, so the baseline can be lowered, never raised.
// A line is exempt with `colour-ok: <reason>` on it or on the line above.

import { exemptionMatcher } from "./exemptions.mjs";
import { listFiles } from "./files.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
// Three-letter words that are also hex digits, written as ids or URL fragments ("#add"), are not colours.
const WORDS = ["add", "bad", "fee", "dad", "bed", "cab", "fab"];

/**
 * Hard-coded colours per file (files with none are left out).
 * @param {{ cwd?: string, files: string[], words?: string[] }} opts
 */
export function countColours({ cwd = process.cwd(), files, words = WORDS }) {
  const ex = exemptionMatcher("colour-ok");
  const notColour = new RegExp(`^#(${words.join("|")})$`, "i");
  /** @type {Record<string, number>} */
  const counts = {};
  for (const f of files) {
    const lines = readFileSync(join(cwd, f), "utf8").split("\n");
    let n = 0;
    lines.forEach((line, i) => {
      if (!ex.exempt(lines, i)) n += (line.match(HEX) ?? []).filter((m) => !notColour.test(m)).length;
    });
    if (n > 0) counts[f] = n;
  }
  return counts;
}

/**
 * Files over their allowed count.
 * @param {Record<string, number>} counts @param {Record<string, number>} baseline
 */
export function colourIncreases(counts, baseline) {
  return Object.entries(counts)
    .filter(([f, n]) => n > (baseline[f] ?? 0))
    .map(([file, count]) => ({ file, count, allowed: baseline[file] ?? 0 }));
}

const DEFAULT_HINT = "Use a theme token or a named palette colour instead.";

/**
 * The `colours` command.
 * @param {{ cwd?: string, config: Record<string, any>, write?: boolean }} opts
 */
export function runColours({ cwd = process.cwd(), config, write = false }) {
  const c = config.colours;
  if (!c) return { ok: true, report: "colours: not configured (add `colours` to quality-gates.config.mjs)" };
  const files = listFiles({
    cwd,
    include: c.include ?? ["src"],
    extensions: c.extensions ?? ["ts", "tsx"],
    exclude: c.exclude ?? [],
  });
  const counts = countColours({ cwd, files, words: c.words });
  const path = join(cwd, c.baseline ?? "colour-baseline.json");
  const hasBaseline = existsSync(path);
  const baseline = hasBaseline ? JSON.parse(readFileSync(path, "utf8")) : {};
  const ups = colourIncreases(counts, baseline);
  const hint = c.hint ?? DEFAULT_HINT;
  const lines = ups.map((u) => `${u.file}: ${u.count} hard-coded colours, ${u.allowed} allowed. ${hint}`);
  const problems = `${ups.length} problem${ups.length === 1 ? "" : "s"}\n${lines.join("\n")}`;
  if (write) {
    // The first write records what is there; after that the baseline may only go down.
    if (hasBaseline && ups.length) return { ok: false, report: `colours: refusing to raise the baseline, ${problems}` };
    writeFileSync(path, `${JSON.stringify(counts, null, 2)}\n`);
    return { ok: true, report: `colours: wrote ${Object.keys(counts).length} files` };
  }
  if (ups.length) return { ok: false, report: `colours: ${problems}` };
  return { ok: true, report: `colours: ${files.length} files, no new colours` };
}
