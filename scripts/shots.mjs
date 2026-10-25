// Screenshots of chosen pages for Day Shift's visual QA (issue 366): each page at 1440 and 390 wide, light and dark.
//
//   DAYSHIFT_SHOTS_DIR=/tmp/shots DAYSHIFT_SHOTS_PAGES=/dashboard/week,/dashboard/invoices npm run shots
//
// DAYSHIFT_SHOTS_DIR (required) is the folder for the PNGs; it is made if missing, and a relative path counts from the
// project folder. DAYSHIFT_SHOTS_PAGES is a comma-separated list of routes; empty = DEFAULT_PAGES. Files are named
// `<route-slug>-<width>-<theme>.png` (see `shotFile`). It checks the settings, then runs e2e/shots.spec.ts on the local
// test copy of the app (E2E_PORT, MOCK_RESEND_PORT and E2E_DEV work as in playwright.config.ts), signed in as a new e2e
// test account. Local only: the sign-up would make a real account on a live site. Exits 1 on bad settings (one plain
// sentence, no browser started), otherwise with Playwright's exit code. Tested by shots-journey.test.ts.

import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export const DEFAULT_PAGES = ["/", "/dashboard/today", "/dashboard/week", "/dashboard/invoices"];
/**
 * The two screen sizes, wide first: [width, height].
 * @type {[number, number][]}
 */
export const SIZES = [
  [1440, 900],
  [390, 844],
];
/** @type {("light" | "dark")[]} */
export const THEMES = ["light", "dark"];

export const MISSING_DIR = "Set DAYSHIFT_SHOTS_DIR to the folder where the screenshots should go.";
export const NOT_LOCAL = "npm run shots only runs against a local server (localhost or 127.0.0.1).";

/** True when the base URL points at this machine (localhost or 127.0.0.1); false for anything else or a bad URL. */
export function isLocalBase(url) {
  try {
    return ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * The routes in DAYSHIFT_SHOTS_PAGES: trimmed, empty items dropped, each route once, in the order given. Nothing left
 * = DEFAULT_PAGES. Returns { pages } or { problem } when a route does not start with /.
 * @param {string | undefined} text
 * @returns {{ pages: string[], problem?: undefined } | { problem: string, pages?: undefined }}
 */
export function shotPages(text) {
  const routes = [
    ...new Set(
      (text ?? "")
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
    ),
  ];
  const bad = routes.find((r) => !r.startsWith("/"));
  if (bad) return { problem: `The route "${bad}" in DAYSHIFT_SHOTS_PAGES must start with /.` };
  return { pages: routes.length ? routes : DEFAULT_PAGES };
}

/** The file name part for a route: no query or hash, no leading /dashboard/, other / turned into -; / is "home". */
export function routeSlug(route) {
  const path = route.split(/[?#]/)[0].replace(/\/+$/, "");
  if (!path) return "home";
  return path
    .replace(/^\/dashboard\//, "")
    .replace(/^\//, "")
    .replaceAll("/", "-");
}

/** `<route-slug>-<width>-<theme>.png` */
export const shotFile = (route, width, theme) => `${routeSlug(route)}-${width}-${theme}.png`;

/** The four files one page gives, in the order they are taken: 1440 light, 1440 dark, 390 light, 390 dark. */
export const shotFiles = (route) => SIZES.flatMap(([width]) => THEMES.map((theme) => shotFile(route, width, theme)));

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** The width in a PNG's header (IHDR, bytes 16 to 19), or null when the buffer is not a PNG. */
export function pngWidth(buffer) {
  if (buffer.length < 24 || PNG_SIGNATURE.some((b, i) => buffer[i] !== b)) return null;
  return buffer.readUInt32BE(16);
}

/**
 * Reads and checks the settings. Returns { dir, pages } (dir is absolute) or { problem } with one plain sentence.
 * @param {Record<string, string | undefined>} env
 * @param {string} cwd
 * @returns {{ dir: string, pages: string[], problem?: undefined } | { problem: string, dir?: undefined, pages?: undefined }}
 */
export function readSettings(env, cwd) {
  const dir = env.DAYSHIFT_SHOTS_DIR?.trim();
  if (!dir) return { problem: MISSING_DIR };
  if (env.E2E_BASE_URL && !isLocalBase(env.E2E_BASE_URL)) return { problem: NOT_LOCAL };
  const list = shotPages(env.DAYSHIFT_SHOTS_PAGES);
  if (list.problem) return { problem: list.problem };
  return { dir: resolve(cwd, dir), pages: list.pages };
}

// Run directly (not imported). No `import.meta` here: Playwright loads this file for e2e/shots.spec.ts as CommonJS.
if (process.argv[1] && basename(process.argv[1]) === "shots.mjs") {
  const settings = readSettings(process.env, process.cwd());
  if (settings.problem) {
    console.error(settings.problem);
    process.exit(1);
  }
  mkdirSync(settings.dir, { recursive: true });
  const started = Date.now() - 1000; // a second of slack for the file system's clock
  const run = spawnSync("npx", ["playwright", "test", "e2e/shots.spec.ts", "--project=desktop", "--no-deps"], {
    stdio: "inherit",
    env: { ...process.env, SHOTS: "1", DAYSHIFT_SHOTS_DIR: settings.dir },
  });
  // Only the files this run wrote (an older file with the same name may be left from an earlier run that failed).
  const written = settings.pages
    .flatMap(shotFiles)
    .map((name) => join(settings.dir, name))
    .filter((path) => {
      try {
        return statSync(path).mtimeMs >= started;
      } catch {
        return false;
      }
    });
  for (const path of written) console.log(path);
  console.log(`${written.length} screenshots in ${settings.dir}`);
  process.exit(run.status ?? 1);
}
