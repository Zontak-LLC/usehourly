// The cheap clean-up after a stress run (issue 180): throw the STAGING database away and make a fresh, empty one.
// Deleting millions of rows one by one is billed as millions of row writes; deleting the database costs nothing.
//
//   npm run stress:cleanup-staging
//
// What it does, in order, and only for the database named hourly-staging-db in wrangler.staging.jsonc:
//   1. checks the config names hourly-staging-db, binding DB, and that its id is NOT production's (wrangler.jsonc)
//   2. checks Cloudflare's hourly-staging-db has exactly the id the config holds
//   3. asks you to type the database name
//   4. wrangler d1 delete hourly-staging-db, then wrangler d1 create hourly-staging-db
//   5. writes the new database id into wrangler.staging.jsonc (git-ignored) and applies every migration to it
// EVERYTHING on staging goes, not only the stress accounts: test accounts, Night Watch's account, the drill setting.
// The Worker still points at the old id until the next `npm run staging:deploy`; until then staging answers errors.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

export const STAGING_DB = "hourly-staging-db";
const STAGING_CONFIG = "wrangler.staging.jsonc";
const PROD_CONFIG = "wrangler.jsonc";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

/** The D1 entries of a wrangler config (JSON with comments): [{ binding, database_name, database_id }]. */
export function d1Entries(text) {
  const block = text.match(/"d1_databases"\s*:\s*\[([\s\S]*?)\]/);
  if (!block) return [];
  return [...block[1].matchAll(/\{[^}]*\}/g)].map((m) => ({
    binding: m[0].match(/"binding"\s*:\s*"([^"]*)"/)?.[1],
    database_name: m[0].match(/"database_name"\s*:\s*"([^"]*)"/)?.[1],
    database_id: m[0].match(/"database_id"\s*:\s*"([^"]*)"/)?.[1],
  }));
}

/** Why this config must not be recreated, or null when it is the staging database and nothing else. */
export function refusal(stagingText, prodText) {
  const dbs = d1Entries(stagingText);
  if (dbs.length !== 1) return `${STAGING_CONFIG} must name exactly one D1 database (it names ${dbs.length}).`;
  const [db] = dbs;
  if (db.database_name !== STAGING_DB) return `${STAGING_CONFIG} names "${db.database_name}", not ${STAGING_DB}.`;
  if (db.binding !== "DB") return `${STAGING_CONFIG} binds the database as "${db.binding}", not DB.`;
  if (!UUID.test(db.database_id ?? "")) return `${STAGING_CONFIG} has no real database id.`;
  if (!/"name"\s*:\s*"hourly-staging"/.test(stagingText)) return `${STAGING_CONFIG} is not the hourly-staging Worker.`;
  const prodIds = d1Entries(prodText ?? "").map((d) => d.database_id);
  if (prodIds.includes(db.database_id)) return `${STAGING_CONFIG} holds production's database id. Stopping.`;
  return null;
}

function wrangler(args, { capture = true } = {}) {
  return execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
}

async function main() {
  if (!existsSync(STAGING_CONFIG)) throw new Error(`${STAGING_CONFIG} is missing (run this in the project folder).`);
  const stagingText = readFileSync(STAGING_CONFIG, "utf8");
  const why = refusal(stagingText, existsSync(PROD_CONFIG) ? readFileSync(PROD_CONFIG, "utf8") : "");
  if (why) throw new Error(why);
  const oldId = d1Entries(stagingText)[0].database_id;

  const info = wrangler(["d1", "info", STAGING_DB, "--config", STAGING_CONFIG, "--json"]);
  const liveId = JSON.parse(info).uuid;
  if (liveId !== oldId) throw new Error(`Cloudflare's ${STAGING_DB} is ${liveId}, the config says ${oldId}. Stopping.`);

  console.log(`This DELETES the staging database ${STAGING_DB} (${oldId}) and everything in it, then makes it again.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`Type ${STAGING_DB} to go on: `)).trim();
  rl.close();
  if (typed !== STAGING_DB) {
    console.log("Nothing was changed.");
    return;
  }

  wrangler(["d1", "delete", STAGING_DB, "--config", STAGING_CONFIG, "--skip-confirmation"], { capture: false });
  // From here on the old database is gone: if a step fails, finish it by hand (d1 create, the id, migrations apply).
  const created = wrangler(["d1", "create", STAGING_DB, "--config", STAGING_CONFIG]);
  const newId = created.match(UUID)?.[0];
  if (!newId) throw new Error(`Made ${STAGING_DB} but could not read its id. Put it in ${STAGING_CONFIG} by hand.`);
  writeFileSync(STAGING_CONFIG, stagingText.replace(/("database_id"\s*:\s*")[^"]*(")/, `$1${newId}$2`));
  console.log(`New ${STAGING_DB}: ${newId} (written to ${STAGING_CONFIG}).`);
  wrangler(["d1", "migrations", "apply", "DB", "--remote", "--config", STAGING_CONFIG], { capture: false });
  console.log("Done. Run `npm run staging:deploy` so the Worker uses the new database.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
