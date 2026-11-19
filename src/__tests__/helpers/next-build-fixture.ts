import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * A tiny `.next` folder for the tests of the size scripts (scripts/bundle-size.mjs, scripts/route-size.mjs): the root
 * files, a landing page in a route group, /privacy, a dashboard page and /_not-found, with chunk text written here.
 */

/** A page manifest as Next 16 writes it: two lines that set globalThis.__RSC_MANIFEST[<page>]. */
export const manifestText = (page: string, entryJSFiles: Record<string, string[]>) =>
  `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST[${JSON.stringify(page)}] = ${JSON.stringify(
    { moduleLoading: { prefix: "" }, clientModules: {}, entryCSSFiles: {}, entryJSFiles },
  )};\n`;

/** Chunk text of different sizes (repeated words gzip small, so each chunk gets its own varied text). */
export const CHUNKS: Record<string, string> = {
  "static/chunks/root.js": Array.from({ length: 300 }, (_, i) => `r${i * 7919}`).join(";"),
  "static/chunks/layout.js": Array.from({ length: 200 }, (_, i) => `l${i * 104729}`).join(";"),
  "static/chunks/landing.js": Array.from({ length: 100 }, (_, i) => `p${i * 1299709}`).join(";"),
  "static/chunks/privacy.js": "export const privacy = 1;",
  "static/chunks/month.js": Array.from({ length: 400 }, (_, i) => `m${i * 15485863}`).join(";"),
};

/** The gzip size of one fixture chunk, as the scripts count it. */
export const gz = (file: string) => gzipSync(CHUNKS[file]).length;

/** Writes the tiny build into `next`; `chunks` replaces the chunk text (to plant the zod marker, for example). */
export function writeNextBuild(next: string, chunks: Record<string, string> = CHUNKS) {
  const app = join(next, "server/app");
  for (const [file, text] of Object.entries(chunks)) {
    mkdirSync(join(next, "static/chunks"), { recursive: true });
    writeFileSync(join(next, file), text);
  }
  writeFileSync(join(next, "build-manifest.json"), JSON.stringify({ rootMainFiles: ["static/chunks/root.js"] }));
  const pages: [string, string, Record<string, string[]>][] = [
    [
      "(main)",
      "/(main)/page",
      {
        "[project]/src/app/layout": ["static/chunks/layout.js"],
        "[project]/src/app/(main)/page": ["static/chunks/layout.js", "static/chunks/landing.js"],
      },
    ],
    [
      "privacy",
      "/privacy/page",
      {
        "[project]/src/app/layout": ["static/chunks/layout.js"],
        "[project]/src/app/privacy/page": ["static/chunks/privacy.js"],
      },
    ],
    [
      "(main)/dashboard/month",
      "/(main)/dashboard/month/page",
      {
        "[project]/src/app/layout": ["static/chunks/layout.js"],
        "[project]/src/app/(main)/dashboard/month/page": ["static/chunks/month.js"],
      },
    ],
    ["_not-found", "/_not-found/page", { "[project]/src/app/layout": ["static/chunks/layout.js"] }],
  ];
  for (const [folder, page, entries] of pages) {
    mkdirSync(join(app, folder), { recursive: true });
    writeFileSync(join(app, folder, "page_client-reference-manifest.js"), manifestText(page, entries));
  }
}

// A git hook (pre-push) sets GIT_DIR and friends for every program it starts; without dropping them the script's
// `git rev-parse` in the temp folder would read the real repository's commit instead of "unknown".
const env: NodeJS.ProcessEnv = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];

/** Runs a node script in `cwd` as `npm run` would, and resolves with its exit code and output (never rejects). */
export function runScript(script: string, args: string[], cwd: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, [script, ...args], { cwd, env, encoding: "utf8" }, (err, stdout, stderr) =>
      resolve({ code: err ? Number(err.code ?? 1) : 0, stdout, stderr }),
    );
  });
}
