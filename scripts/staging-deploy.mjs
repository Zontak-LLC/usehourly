// Builds and deploys the STAGING copy (https://staging.usehourly.app) with a clean environment.
//
// Why this exists: `opennextjs-cloudflare build` reads .env, .env.local, .env.production.local and .dev.vars from the
// project folder and copies their values INTO the Worker bundle. A staging build made on a developer machine would
// then carry the developer's real secrets (email key, sign-in secrets, robot-check keys). So the files are moved
// aside for the length of the build and always put back, and the finished bundle is searched for any value that
// came from them before anything is deployed.
//
// The files are parked in .staging-parked/ INSIDE the project (git-ignored), never in a temp folder: if the process is
// killed or the machine loses power mid-build, the next run (or `node scripts/staging-deploy.mjs --restore`) puts
// them back first, so a secret file is never stranded somewhere that gets cleaned up.
//
//   npm run staging:deploy
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const PARK = join(root, ".staging-parked");
const FILES = [".env", ".env.local", ".env.production", ".env.production.local", ".env.development.local", ".dev.vars"];
const APP_URL = "https://staging.usehourly.app";
const CONFIG = "wrangler.staging.jsonc";

/** Puts every parked file back (safe to call any number of times). */
const restore = () => {
  if (!existsSync(PARK)) return;
  for (const f of readdirSync(PARK)) {
    const target = join(root, f);
    if (existsSync(target)) {
      console.error(`Not overwriting ${f}: a file with that name exists. The parked copy stays in .staging-parked/.`);
      continue;
    }
    renameSync(join(PARK, f), target);
  }
  if (readdirSync(PARK).length === 0) rmSync(PARK, { recursive: true, force: true });
};

// A previous run was killed: recover first, then stop so the person looks at the state before building again.
if (existsSync(PARK) && readdirSync(PARK).length > 0) {
  restore();
  console.error("Restored env files left over from an interrupted staging deploy. Run the command again.");
  process.exit(process.argv.includes("--restore") ? 0 : 1);
}
if (process.argv.includes("--restore")) {
  console.log("Nothing to restore.");
  process.exit(0);
}

if (!existsSync(join(root, CONFIG))) {
  console.error(`Missing ${CONFIG}. Copy wrangler.staging.example.jsonc and fill it in (docs/operations.md, Staging).`);
  process.exit(1);
}

/** A plain public address (no credentials, no query, no path) is not a secret; anything else with http in it is checked. */
const isPublicUrl = (v) => {
  try {
    const u = new URL(v);
    return !u.username && !u.password && !u.search && (u.pathname === "/" || u.pathname === "");
  } catch {
    return false;
  }
};
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// The secret values the files hold, to prove none of them ended up in the bundle.
const values = new Set();
for (const f of FILES) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?[A-Za-z0-9_]+\s*=\s*(.*)$/);
    const v = m?.[1]?.trim().replace(/^["']|["']$/g, "");
    // Contact email addresses are written in the app on purpose, so they are not secrets.
    if (v && v.length >= 8 && !isEmail(v) && !isPublicUrl(v)) values.add(v);
  }
}

const run = (cmd, args, env = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// Killed from outside: put the files back, then go.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    restore();
    process.exit(130);
  });
}

try {
  mkdirSync(PARK, { recursive: true });
  for (const f of FILES) {
    if (existsSync(join(root, f))) renameSync(join(root, f), join(PARK, f));
  }
  const env = { NEXT_PUBLIC_APP_URL: APP_URL, NEXT_PUBLIC_APP_ENV: "staging" };
  await run("npx", ["opennextjs-cloudflare", "build", "--config", CONFIG], env);

  // The static assets are public files; secrets can only be inside the server bundle, so that is what is searched.
  const assets = join(root, ".open-next", "assets");
  const leaked = [];
  for (const file of walk(join(root, ".open-next")).filter(
    (p) => !p.startsWith(assets) && /\.(m?js|json|txt)$/.test(p),
  )) {
    const text = readFileSync(file, "utf8");
    for (const v of values) if (text.includes(v)) leaked.push(file);
  }
  if (leaked.length) {
    console.error(
      `Refusing to deploy: a value from a local env file is inside the bundle (${[...new Set(leaked)][0]}).`,
    );
    process.exitCode = 1;
  } else {
    console.log(`Bundle checked: none of the ${values.size} local secret values are in it.`);
    await run("npx", ["opennextjs-cloudflare", "deploy", "--config", CONFIG], env);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  restore();
}
