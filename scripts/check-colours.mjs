#!/usr/bin/env node
// The colour guard (docs/ui-spec.md, "Colour legend"). Colours that mean something live in src/lib/palette.ts. A file
// may not gain MORE hard-coded hex colours than its recorded count in scripts/colour-baseline.json, and a file with
// none may not start. So a new colour is a decision: add it to the palette and the legend, or reuse a theme token
// (bg-amber, text-foreground, var(--muted) ...). Part of `npm run check:rules`.
//   node scripts/check-colours.mjs          check
//   node scripts/check-colours.mjs --write  record the current counts (only ever LOWER numbers; never raise one)
// A line is exempt with `colour-ok: <reason>` on it or the line above.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BASELINE = "scripts/colour-baseline.json";
const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;

const files = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f) && existsSync(f) && !/(__tests__|\.test\.|^src\/lib\/palette\.ts$)/.test(f));

const counts = {};
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  let n = 0;
  lines.forEach((line, i) => {
    const exempt = /colour-ok:/.test(line) || /colour-ok:/.test(lines[i - 1] ?? "");
    // A URL fragment like "#claim" or "#data" is not a colour: only 3 or 6 hex digits, so "#add" still matches; skip code-ish ids.
    if (!exempt) n += (line.match(HEX) ?? []).filter((m) => !/^#(add|bad|fee|dad|bed|cab|fab)$/i.test(m)).length;
  });
  if (n > 0) counts[f] = n;
}

if (process.argv.includes("--write")) {
  writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`check-colours: wrote ${Object.keys(counts).length} files`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const problems = [];
for (const [f, n] of Object.entries(counts)) {
  const allowed = baseline[f] ?? 0;
  if (n > allowed) {
    problems.push(
      `${f}: ${n} hard-coded colours, ${allowed} allowed. Use a theme token or src/lib/palette.ts, and add the colour to the legend in docs/ui-spec.md.`,
    );
  }
}
if (problems.length) {
  console.error(`check-colours: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`check-colours: ${files.length} files, no new colours`);
