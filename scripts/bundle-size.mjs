// How big the Worker bundle is and what fills it (baseline for issue 280).
//   npx opennextjs-cloudflare build
//   npm run measure:bundle [-- <folder>]   (default .open-next/server-functions/default)
// Reads handler.mjs and its esbuild metafile handler.mjs.meta.json, prints the raw and gzip size and the 20 largest
// packages or .next/server chunks, then writes the same numbers to docs/bundle-size.md. Exits 1 when there is no build.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const DEFAULT_DIR = ".open-next/server-functions/default";
const DOC = "docs/bundle-size.md";
const TOP = 20;
const MB = 1024 * 1024;

/** The group an esbuild input path counts toward: an npm package, a .next/server chunk, or "(other)". */
function groupOf(path) {
  const p = path.replaceAll("\\", "/");
  const nm = p.lastIndexOf("node_modules/");
  if (nm !== -1) {
    const parts = p.slice(nm + "node_modules/".length).split("/");
    return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  const server = p.lastIndexOf(".next/server/");
  if (server !== -1) return p.slice(server + ".next/server/".length);
  return "(other)";
}

/**
 * Sums bytesInOutput of the handler.mjs output's inputs per group. Every group, largest first, ties by name A to Z.
 * Only the output whose key ends in handler.mjs counts (the key is a relative path that differs by machine).
 */
export function groupMetafile(metafile) {
  const key = Object.keys(metafile.outputs ?? {}).find((k) => k.endsWith("handler.mjs"));
  const totals = new Map();
  for (const [path, input] of Object.entries(key ? metafile.outputs[key].inputs : {})) {
    const group = groupOf(path);
    totals.set(group, (totals.get(group) ?? 0) + (input.bytesInOutput ?? 0));
  }
  return [...totals]
    .map(([group, bytes]) => ({ group, bytes }))
    .sort((a, b) => b.bytes - a.bytes || (a.group < b.group ? -1 : a.group > b.group ? 1 : 0));
}

const mb = (bytes) => (bytes / MB).toFixed(2);

/** The totals line, the same in the terminal and in the doc. */
function totalsLine(raw, gzip) {
  return `handler.mjs: ${raw} bytes (${mb(raw)} MB), gzip ${gzip} bytes (${mb(gzip)} MB)`;
}

/** Rank, group, bytes, MB and percent of `summed` (the summed bytesInOutput) for each row of `top`. */
function tableRows(top, summed) {
  return top.map((r, i) => [
    String(i + 1),
    r.group,
    String(r.bytes),
    mb(r.bytes),
    `${summed ? ((r.bytes / summed) * 100).toFixed(1) : "0.0"}%`,
  ]);
}

const HEADER = ["#", "group", "bytes", "MB", "%"];

/** The terminal table: the group column padded, the numbers right-aligned. */
export function formatTable(top, summed) {
  const rows = tableRows(top, summed);
  const width = Math.max(HEADER[1].length, ...rows.map((r) => r[1].length));
  return [HEADER, ...rows]
    .map(([rank, group, bytes, m, pct]) =>
      [rank.padStart(3), group.padEnd(width), bytes.padStart(10), m.padStart(7), pct.padStart(6)].join("  ").trimEnd(),
    )
    .join("\n");
}

/** The text of docs/bundle-size.md. `summed` is the summed bytesInOutput of every group (the percent base). */
export function renderMarkdown({ date, commit, raw, gzip, top, summed }) {
  const base = summed ?? top.reduce((n, r) => n + r.bytes, 0);
  const row = (cells) => `| ${cells.join(" | ")} |`;
  return [
    "# Worker bundle size",
    "",
    "Written by `npm run measure:bundle` after `npx opennextjs-cloudflare build`. Each run overwrites this file; compare",
    "with the git history of the file.",
    "",
    `- Date: ${date}`,
    `- Commit: ${commit}`,
    `- Raw: ${raw} bytes (${mb(raw)} MB)`,
    `- Gzip: ${gzip} bytes (${mb(gzip)} MB)`,
    "",
    `## Top ${top.length} inputs of handler.mjs`,
    "",
    "Grouped by npm package or by `.next/server` chunk. Bytes are esbuild's bytesInOutput. Percent is of their sum",
    `(${base} bytes), which is not the raw file size: OpenNext edits handler.mjs after esbuild writes the metafile.`,
    "",
    row(HEADER),
    row(["--:", ":--", "--:", "--:", "--:"]),
    ...tableRows(top, base).map(row),
    "",
  ].join("\n");
}

function shortCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return "unknown";
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? DEFAULT_DIR;
  const handler = join(dir, "handler.mjs");
  const meta = `${handler}.meta.json`;
  if (!existsSync(handler) || !existsSync(meta)) {
    console.error("Run npx opennextjs-cloudflare build first");
    process.exit(1);
  }
  const raw = statSync(handler).size;
  const gzip = gzipSync(readFileSync(handler)).length;
  const groups = groupMetafile(JSON.parse(readFileSync(meta, "utf8")));
  const summed = groups.reduce((n, g) => n + g.bytes, 0);
  const top = groups.slice(0, TOP);
  if (raw < 1024) console.warn(`Warning: ${handler} is under 1 KB; it may be a monorepo re-export, not the bundle.`);
  console.log(totalsLine(raw, gzip));
  console.log(formatTable(top, summed));
  const date = new Date().toLocaleDateString("en-CA"); // the local date as YYYY-MM-DD
  writeFileSync(DOC, renderMarkdown({ date, commit: shortCommit(), raw, gzip, top, summed }));
  console.log(`Wrote ${DOC}`);
}
