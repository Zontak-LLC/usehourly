// How much JavaScript each page loads before it can be used, from a plain `next build` (no Worker build needed).
//   npx next build
//   npm run measure:routes [-- --before] [--next <dir>]
// For each route: the gzip of its unique first-load chunks (Next's rootMainFiles plus the route's entryJSFiles, each
// counted once), largest first, and whether any of them holds zod. The table goes into docs/bundle-size.md under
// ROUTE_SIZE_MARKER, as the After table (or the Before table with --before); everything above the marker stays.
// Reads only the build output and writes only that doc. Exits 1 with "Run next build first" when there is no build.

import { ManifestError, measureRoutes, ROUTE_SIZE_MARKER, shortCommit, ZOD_MARKER } from "./bundle-size.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DOC = "docs/bundle-size.md";
const DEFAULT_NEXT_DIR = ".next";
const KB = 1024;
export const BEFORE_HEADING = "### Before (base)";
export const AFTER_HEADING = "### After";
const NOT_RUN = "Filled by npm run measure:routes; never typed by hand.";

const kb = (bytes) => (bytes / KB).toFixed(1);
const chunkPath = (nextDir, file) => join(nextDir, file.replace(/^\/?_next\//, ""));

/**
 * Every app route with its first-load gzip bytes and whether a first-load chunk holds zod (ZOD_MARKER), largest
 * first, ties by route A to Z. A chunk shared by two routes counts in each, but once within a route. Throws
 * ManifestError when the build is not in the shape measureRoutes reads.
 */
export function routeSizes(nextDir) {
  const holdsZod = new Map();
  const zodIn = (file) => {
    if (!holdsZod.has(file)) holdsZod.set(file, readFileSync(chunkPath(nextDir, file), "utf8").includes(ZOD_MARKER));
    return holdsZod.get(file);
  };
  return measureRoutes(nextDir)
    .map((r) => ({ route: r.route, gzip: r.gzip, zod: r.files.some(zodIn) }))
    .sort((a, b) => b.gzip - a.gzip || (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));
}

/** The terminal table: route padded, KB gz right-aligned, zod yes/no. */
export function formatRoutes(rows) {
  const width = Math.max("route".length, ...rows.map((r) => r.route.length));
  const line = (route, size, zod) => `${route.padEnd(width)}  ${size.padStart(8)}  ${zod}`;
  return [line("route", "KB gz", "zod"), ...rows.map((r) => line(r.route, kb(r.gzip), r.zod ? "yes" : "no"))].join(
    "\n",
  );
}

/** One table block (heading, date and commit, the rows) for the doc. */
export function renderRun(heading, { date, commit, rows }) {
  const row = (cells) => `| ${cells.join(" | ")} |`;
  return [
    heading,
    "",
    `Commit ${commit}, ${date}.`,
    "",
    row(["route", "KB gz", "zod"]),
    row([":--", "--:", ":--"]),
    ...rows.map((r) => row([r.route, kb(r.gzip), r.zod ? "yes" : "no"])),
    "",
  ].join("\n");
}

const emptyBlock = (heading) => [heading, "", NOT_RUN, ""].join("\n");

/** The Before and After blocks of an earlier section (exact headings, no regex); an empty block where there is none. */
function blocksOf(section) {
  const before = section.indexOf(BEFORE_HEADING);
  const after = section.indexOf(AFTER_HEADING);
  return {
    before: before === -1 ? emptyBlock(BEFORE_HEADING) : section.slice(before, after > before ? after : undefined),
    after: after === -1 ? emptyBlock(AFTER_HEADING) : section.slice(after),
  };
}

/** The whole section, from the marker line to the end of the doc. */
export function renderSection({ before, after }) {
  return [
    ROUTE_SIZE_MARKER,
    "## First-load JavaScript per route (next build)",
    "",
    "Written by `npm run measure:routes` after `npx next build`: the gzip of each route's unique first-load chunks",
    "(`rootMainFiles` in `.next/build-manifest.json` plus the route's `entryJSFiles`), largest first, and whether one of",
    `them holds zod (marker \`${ZOD_MARKER}\`). \`-- --before\` writes the Before table; a run without it writes After.`,
    "",
    before.trimEnd(),
    "",
    after.trimEnd(),
    "",
  ].join("\n");
}

/**
 * The doc with this run's table in place: everything above ROUTE_SIZE_MARKER unchanged, then the section with the
 * other table kept as it was. `old` without the marker gets the section added at its end.
 */
export function updateDoc(old, { before, run }) {
  const start = old.indexOf(ROUTE_SIZE_MARKER);
  const above = start === -1 ? (old && !old.endsWith("\n") ? `${old}\n` : old) : old.slice(0, start);
  const kept = blocksOf(start === -1 ? "" : old.slice(start));
  const fresh = renderRun(before ? BEFORE_HEADING : AFTER_HEADING, run);
  const section = renderSection(before ? { before: fresh, after: kept.after } : { before: kept.before, after: fresh });
  return `${above}${above && !above.endsWith("\n\n") ? "\n" : ""}${section}`;
}

/** `[--before] [--next <dir>]` in any order. */
function readArgs(argv) {
  const args = { nextDir: DEFAULT_NEXT_DIR, before: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--before") args.before = true;
    else if (argv[i] === "--next") args.nextDir = argv[++i] ?? DEFAULT_NEXT_DIR;
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { nextDir, before } = readArgs(process.argv.slice(2));
  if (!existsSync(join(nextDir, "build-manifest.json"))) {
    console.error("Run next build first");
    process.exit(1);
  }
  let rows;
  try {
    rows = routeSizes(nextDir);
  } catch (err) {
    if (!(err instanceof ManifestError)) throw err;
    console.error(`Could not read the Next build's manifests (has the Next.js format changed?): ${err.message}`);
    process.exit(1);
  }
  console.log("First-load JavaScript per route (gzip)");
  console.log(formatRoutes(rows));
  const withZod = rows.filter((r) => r.zod).map((r) => r.route);
  console.log(withZod.length ? `zod is in the first load of: ${withZod.join(", ")}` : "No route loads zod first.");

  const run = { date: new Date().toLocaleDateString("en-CA"), commit: shortCommit(), rows }; // local date, YYYY-MM-DD
  const old = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  writeFileSync(DOC, updateDoc(old, { before, run }));
  console.log(`Wrote the ${before ? "Before" : "After"} table to ${DOC}`);
}
