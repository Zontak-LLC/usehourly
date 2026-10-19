#!/usr/bin/env node
// Project rules that a linter cannot express, checked with plain text search. Part of `npm run ci`.
// A rule that fails prints file:line and why, then the script exits 1.
// A line is exempt when it, or the line above it, carries `biome-ignore` or `check-rules-ok: <reason>`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "src", "e2e", "scripts", "bridge", "custom-worker.ts"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => /\.(ts|tsx|mjs)$/.test(f) && f !== "scripts/check-rules.mjs");

const rules = [
  { name: "no @ts-ignore / @ts-nocheck (use @ts-expect-error with a reason)", re: /@ts-(ignore|nocheck)/ },
  {
    name: "no `as unknown as` double casts in app code",
    re: /\bas unknown as\b/,
    only: /^src\//,
    skip: /(__tests__|\.test\.)/,
  },
  { name: "TODO/FIXME/HACK must name an issue, e.g. TODO(#41)", re: /\b(TODO|FIXME|HACK)\b(?!\(#\d+\))/ },
  {
    name: "read the client address with clientIpFrom(), never cf-connecting-ip directly",
    re: /cf-connecting-ip/i,
    skip: /(client-ip\.ts|__tests__)/,
  },
  {
    name: "no .only, no unconditional .skip in tests",
    re: /\b(it|test|describe)\.only\(|\b(it|test|describe)\.skip\(\s*["'`]/,
    only: /(__tests__|e2e)/,
  },
  { name: "no dangerouslySetInnerHTML", re: /dangerouslySetInnerHTML/ },
  // UI rules (docs/ui-spec.md): one shade per depth, one empty state, one notice.
  {
    name: "a card header band uses bg-band-1/2/3, not bg-muted/40 (docs/ui-spec.md)",
    re: /border-b bg-muted\/40/,
    only: /^src\//,
  },
  {
    name: "a notice box is the Notice component, not a hand-made tinted box (docs/ui-spec.md)",
    re: /rounded-(lg|xl) border bg-muted\/40 p-/,
    only: /^src\//,
  },
  {
    name: "an empty state is the EmptyState component, not a hand-made dashed paragraph (docs/ui-spec.md)",
    re: /<p className="[^"]*border-dashed/,
    only: /^src\//,
  },
  { name: "no eval / new Function", re: /\beval\(|new Function\(/ },
];

const failures = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const exempt = /biome-ignore|check-rules-ok:/.test(line) || /biome-ignore|check-rules-ok:/.test(lines[i - 1] ?? "");
    for (const r of rules) {
      if (exempt) continue;
      if (r.only && !r.only.test(file)) continue;
      if (r.skip?.test(file)) continue;
      if (r.re.test(line)) failures.push(`${file}:${i + 1}  ${r.name}`);
    }
  });
}
if (failures.length) {
  console.error(`${failures.length} rule violation(s):\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`check-rules: ${files.length} files, ${rules.length} rules, clean`);
