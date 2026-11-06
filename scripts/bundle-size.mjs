// How big the Worker bundle is and what fills it (baseline for issue 280), and how much JavaScript each page loads
// before it can be used (issue 425).
//   npx opennextjs-cloudflare build
//   npm run measure:bundle [-- <folder>] [--next <dir>] [--before]
// Worker: reads handler.mjs in <folder> (default .open-next/server-functions/default) and its esbuild metafile
// handler.mjs.meta.json, prints the raw and gzip size and the 20 largest packages or .next/server chunks.
// Browser: reads the Next build in <dir> (default .next) and prints the gzip size of each route's first-load chunks.
// Both go to docs/bundle-size.md in one run. --before saves this run's route table as the "Before" table; a normal run
// keeps the Before table already in the doc and compares with it. Exits 1 when a build is missing, when the Next
// manifests are not in the format this script knows, or when zod is in the first load of / or /privacy.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const DEFAULT_DIR = ".open-next/server-functions/default";
const DEFAULT_NEXT_DIR = ".next";
const DOC = "docs/bundle-size.md";
const TOP = 20;
const MB = 1024 * 1024;
const KB = 1024;
/**
 * A string only zod's own code holds: the name of the base class of every zod v4 schema. Checked in the 'before' build
 * (commit 153c79c): it was in the root layout's chunk, which every page loads.
 */
export const ZOD_MARKER = "$ZodType";
/** The pages that must load no zod at all: the public landing page and a plain text page. */
export const ZOD_FREE_ROUTES = ["/", "/privacy"];
const CLIENT_MANIFEST = "page_client-reference-manifest.js";
const BEFORE_START = "<!-- before:start -->";
const BEFORE_END = "<!-- before:end -->";

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

/** Thrown when the Next build is there but not in the shape this script reads; the message says what was wrong. */
export class ManifestError extends Error {}

/** "/(main)/dashboard/month/page" -> "/dashboard/month": route groups dropped, "/page" dropped, "" -> "/". */
export function routeOfManifestKey(key) {
  const segments = key
    .replace(/\/page$/, "")
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s));
  return `/${segments.join("/")}`;
}

/**
 * One page_client-reference-manifest.js: the route and the chunks its entries list (`entryJSFiles`: the root layout,
 * every layout on the way, error and not-found boundaries, and the page). Throws ManifestError on anything unexpected.
 */
export function parseClientManifest(text, file = CLIENT_MANIFEST) {
  const match = /__RSC_MANIFEST\[("(?:[^"\\]|\\.)*")\]\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(text);
  if (!match) throw new ManifestError(`${file}: no __RSC_MANIFEST["<page>"] = {...} found`);
  let key;
  let manifest;
  try {
    key = JSON.parse(match[1]);
    manifest = JSON.parse(match[2]);
  } catch (err) {
    throw new ManifestError(`${file}: the manifest is not JSON (${err.message})`);
  }
  const entries = manifest?.entryJSFiles;
  if (!entries || typeof entries !== "object" || Object.keys(entries).length === 0) {
    throw new ManifestError(`${file}: no entryJSFiles`);
  }
  const files = new Set();
  for (const list of Object.values(entries)) {
    if (!Array.isArray(list)) throw new ManifestError(`${file}: an entryJSFiles value is not a list`);
    for (const f of list) files.add(f);
  }
  if (files.size === 0) throw new ManifestError(`${file}: entryJSFiles lists no chunk`);
  return { route: routeOfManifestKey(key), files: [...files] };
}

/** Every page manifest under <nextDir>/server/app, as paths relative to the folder. */
function manifestFiles(nextDir) {
  const app = join(nextDir, "server", "app");
  if (!existsSync(app)) return [];
  return readdirSync(app, { recursive: true })
    .map(String)
    .filter((p) => p.endsWith(CLIENT_MANIFEST))
    .map((p) => join(app, p));
}

/**
 * The first-load chunks of every app route: Next's root files (`rootMainFiles` in build-manifest.json, the runtime every
 * page loads) plus the route's entryJSFiles, each gzipped once and summed. Internal routes (/_not-found,
 * /_global-error) are left out. Sorted by route. Never returns a zero: a missing chunk is a ManifestError.
 */
export function measureRoutes(nextDir) {
  const buildManifest = join(nextDir, "build-manifest.json");
  if (!existsSync(buildManifest)) throw new ManifestError(`${buildManifest} is missing`);
  const root = JSON.parse(readFileSync(buildManifest, "utf8")).rootMainFiles;
  if (!Array.isArray(root) || root.length === 0) throw new ManifestError(`${buildManifest}: no rootMainFiles`);
  const manifests = manifestFiles(nextDir);
  if (manifests.length === 0) throw new ManifestError(`no ${CLIENT_MANIFEST} under ${join(nextDir, "server", "app")}`);

  const gzipOf = new Map();
  const sizeOf = (file) => {
    if (!gzipOf.has(file)) {
      const path = join(nextDir, file.replace(/^\/?_next\//, ""));
      if (!existsSync(path)) throw new ManifestError(`a listed chunk is missing: ${path}`);
      gzipOf.set(file, gzipSync(readFileSync(path)).length);
    }
    return gzipOf.get(file);
  };
  const rows = [];
  for (const manifest of manifests) {
    const { route, files } = parseClientManifest(readFileSync(manifest, "utf8"), manifest);
    if (route.startsWith("/_")) continue;
    const all = [...new Set([...root, ...files])];
    rows.push({ route, gzip: all.reduce((n, f) => n + sizeOf(f), 0), files: all });
  }
  return rows.sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));
}

/** The routes in ZOD_FREE_ROUTES whose first-load chunks hold the zod marker, with the chunk that holds it. */
export function zodInFirstLoad(nextDir, rows) {
  const found = [];
  for (const row of rows.filter((r) => ZOD_FREE_ROUTES.includes(r.route))) {
    const chunk = row.files.find((f) =>
      readFileSync(join(nextDir, f.replace(/^\/?_next\//, "")), "utf8").includes(ZOD_MARKER),
    );
    if (chunk) found.push({ route: row.route, chunk });
  }
  return found;
}

const kb = (bytes) => (bytes / KB).toFixed(1);

/** The route table as markdown rows; with `before`, a change column against it ("" when the route is new). */
function routeTable(rows, before) {
  const row = (cells) => `| ${cells.join(" | ")} |`;
  if (!before)
    return [row(["route", "gzip bytes", "KB"]), row([":--", "--:", "--:"])].concat(
      rows.map((r) => row([r.route, String(r.gzip), kb(r.gzip)])),
    );
  const was = new Map(before.map((r) => [r.route, r.gzip]));
  const change = (r) => {
    if (!was.has(r.route)) return "";
    const d = r.gzip - was.get(r.route);
    return `${d > 0 ? "+" : ""}${kb(d)}`;
  };
  return [row(["route", "gzip bytes", "KB", "KB vs before"]), row([":--", "--:", "--:", "--:"])].concat(
    rows.map((r) => row([r.route, String(r.gzip), kb(r.gzip), change(r)])),
  );
}

/** The routes of a Before block written by routeTable (rows "| /route | bytes | KB |"). */
export function parseBeforeRows(block) {
  return [...block.matchAll(/^\| (\/[^ |]*) \| (\d+) \|/gm)].map((m) => ({ route: m[1], gzip: Number(m[2]) }));
}

/** The Before block (heading and table, between its markers) from an earlier doc, or null when it has none. */
export function beforeBlockOf(doc) {
  const start = doc.indexOf(BEFORE_START);
  const end = doc.indexOf(BEFORE_END);
  return start === -1 || end < start ? null : doc.slice(start, end + BEFORE_END.length);
}

/** A Before block for this run's rows. */
export function renderBeforeBlock({ date, commit, rows }) {
  return [BEFORE_START, `### Before (commit ${commit}, ${date})`, "", ...routeTable(rows), BEFORE_END].join("\n");
}

/** The browser section of docs/bundle-size.md: the kept Before block, then this run's table against it. */
export function renderClientMarkdown({ date, commit, rows, beforeBlock }) {
  const before = beforeBlock ? parseBeforeRows(beforeBlock) : null;
  return [
    "## First-load client JS per route",
    "",
    "Gzip of the chunks a route loads before it can be used: Next's `rootMainFiles` (`.next/build-manifest.json`) plus",
    "every chunk in the route's `entryJSFiles` (`page_client-reference-manifest.js`), each counted once. Chunks loaded on",
    `a click (exceljs, jspdf, the zip export, the export panels) are not in it. The run also checks that ${ZOD_FREE_ROUTES.join(" and ")}`,
    `load no zod (marker \`${ZOD_MARKER}\`). \`npm run measure:bundle -- --before\` replaces the Before table.`,
    "",
    beforeBlock ?? "_No Before table yet: run `npm run measure:bundle -- --before` on the old commit._",
    "",
    `### After (commit ${commit}, ${date})`,
    "",
    ...routeTable(rows, before),
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

/** `[folder] [--next <dir>] [--before]` in any order. */
function readArgs(argv) {
  const args = { dir: DEFAULT_DIR, nextDir: DEFAULT_NEXT_DIR, before: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--before") args.before = true;
    else if (argv[i] === "--next") args.nextDir = argv[++i] ?? DEFAULT_NEXT_DIR;
    else args.dir = argv[i];
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { dir, nextDir, before } = readArgs(process.argv.slice(2));
  const handler = join(dir, "handler.mjs");
  const meta = `${handler}.meta.json`;
  if (!existsSync(handler) || !existsSync(meta)) {
    console.error("Run npx opennextjs-cloudflare build first");
    process.exit(1);
  }
  if (!existsSync(join(nextDir, "build-manifest.json"))) {
    console.error(`No ${nextDir} build found: run npx opennextjs-cloudflare build first`);
    process.exit(1);
  }
  let rows;
  try {
    rows = measureRoutes(nextDir);
  } catch (err) {
    if (!(err instanceof ManifestError)) throw err;
    console.error(`Could not read the Next build's manifests (has the Next.js format changed?): ${err.message}`);
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
  console.log("");
  console.log("First-load client JS per route (gzip)");
  const width = Math.max(...rows.map((r) => r.route.length));
  for (const r of rows)
    console.log(`${r.route.padEnd(width)}  ${String(r.gzip).padStart(8)}  ${kb(r.gzip).padStart(6)} KB`);

  const date = new Date().toLocaleDateString("en-CA"); // the local date as YYYY-MM-DD
  const commit = shortCommit();
  const old = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  const beforeBlock = before ? renderBeforeBlock({ date, commit, rows }) : beforeBlockOf(old);
  const worker = renderMarkdown({ date, commit, raw, gzip, top, summed });
  writeFileSync(DOC, `${worker}\n${renderClientMarkdown({ date, commit, rows, beforeBlock })}`);
  console.log(`Wrote ${DOC}`);

  const zod = zodInFirstLoad(nextDir, rows);
  if (zod.length > 0) {
    for (const z of zod) console.error(`zod is in the first load of ${z.route}: ${z.chunk} holds "${ZOD_MARKER}"`);
    console.error("Keep zod on the server: move the schema to src/server/schemas/* (see docs/bundle-size.md).");
    process.exit(1);
  }
  console.log(`No zod in the first load of ${ZOD_FREE_ROUTES.join(" or ")}.`);
}
