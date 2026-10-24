/**
 * Starts the browser tests' copy of the app (issue 197): a BUILT app on E2E_PORT with its own local database folder.
 *
 * Two things make it quicker than "build, then migrate, then start" one after another:
 *  - the database migrations run WHILE the app builds (they touch different things), instead of after it;
 *  - the build is reused when nothing it is made from has changed since the last run (the source, the public files,
 *    the configs, the installed packages and the build settings). A second run in a row skips about 20 to 60 seconds.
 *    E2E_REBUILD=1 always builds.
 *
 * Run by playwright.config.ts as its web server; never run by hand against the normal dev server's folders.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const port = process.env.E2E_PORT ?? "3029";
const persist = process.env.E2E_PERSIST;
const distDir = process.env.NEXT_DIST_DIR ?? ".next-e2e-build";
const stampFile = join(distDir, "e2e-build-hash");

// What the build is made from. The tests (src/__tests__) are not part of the app, so editing one does not rebuild it.
const INPUT_DIRS = ["src", "public", "prisma"];
const INPUT_FILES = [
  "next.config.mjs",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "postcss.config.mjs",
  "components.json",
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];
// Build-time settings: NEXT_PUBLIC_* values are baked into the pages, so a change to one needs a new build.
const settings = Object.entries(process.env)
  .filter(([k]) => k.startsWith("NEXT_PUBLIC_") || k === "NEXT_DIST_DIR")
  .sort(([a], [b]) => a.localeCompare(b));

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path !== join("src", "__tests__")) out.push(...filesUnder(path));
    } else if (entry.isFile()) out.push(path);
  }
  return out;
}

function inputHash() {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(settings));
  const files = [...INPUT_DIRS.flatMap(filesUnder), ...INPUT_FILES.filter((f) => existsSync(f))].sort();
  for (const file of files) {
    hash.update(`\0${file}\0`);
    hash.update(readFileSync(file));
  }
  return hash.digest("hex");
}

/** Runs a command and resolves with its exit code; its output goes to the web server log. */
function run(command, args, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    child.on("error", () => resolve(1));
  });
}

async function build() {
  const want = inputHash();
  const built = existsSync(join(distDir, "BUILD_ID")) && existsSync(stampFile);
  if (!process.env.E2E_REBUILD && built && readFileSync(stampFile, "utf8") === want) {
    console.log(`[e2e] the app has not changed since the last build (${distDir}): reusing it`);
    return 0;
  }
  const started = Date.now();
  // E2E_SERVE must not be set while building: every page-data worker would boot its own local database.
  const { E2E_SERVE: _serve, ...env } = process.env;
  const code = await run("npx", ["next", "build"], env);
  if (code === 0) {
    writeFileSync(stampFile, want);
    console.log(`[e2e] built in ${Math.round((Date.now() - started) / 1000)} s`);
  }
  return code;
}

function migrate() {
  if (!persist) return Promise.resolve(0);
  return run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", persist]);
}

const [built, migrated] = await Promise.all([build(), migrate()]);
if (built !== 0) {
  console.error("[e2e] next build failed");
  process.exit(built);
}
if (migrated !== 0) {
  console.error("[e2e] applying the migrations to the test database failed");
  process.exit(migrated);
}
const server = spawn("npx", ["next", "start", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, E2E_SERVE: "1" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
