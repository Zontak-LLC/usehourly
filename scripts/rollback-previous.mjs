// Puts production back on the version that was live before the latest deploy.
//   node scripts/rollback-previous.mjs [--dry-run]
// Used by the after-deploy smoke job when the smoke test fails twice (docs/operations.md, "After a deploy"). It only
// moves the Worker's code back: migrations are additive (expand, then remove later), so the database is not touched.
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment. Prints what it did; exits 1 when it cannot.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const WORKER = process.env.WORKER_NAME || "hourly";

/**
 * From the output of `wrangler deployments list --json` (oldest first), the version that was live before the newest
 * deployment, or null when there is nothing earlier to go back to. A deployment that splits traffic between versions
 * (not something we do) is read as its first version.
 */
export function previousVersionId(deployments) {
  const ordered = [...deployments]
    .filter((d) => d?.versions?.[0]?.version_id)
    .sort((a, b) => String(a.created_on).localeCompare(String(b.created_on)));
  if (ordered.length < 2) return null;
  const newest = ordered[ordered.length - 1].versions[0].version_id;
  // Walk back past any earlier deployments of the very same version (a re-deploy of one version).
  for (let i = ordered.length - 2; i >= 0; i--) {
    const id = ordered[i].versions[0].version_id;
    if (id !== newest) return id;
  }
  return null;
}

const wrangler = (args) =>
  execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dry = process.argv.includes("--dry-run");
  const list = JSON.parse(wrangler(["deployments", "list", "--name", WORKER, "--json"]));
  const target = previousVersionId(list);
  if (!target) {
    console.error("No earlier version to roll back to.");
    process.exit(1);
  }
  console.log(`Rolling ${WORKER} back to version ${target}${dry ? " (dry run: nothing changed)" : ""}`);
  if (!dry) {
    wrangler(["rollback", target, "--name", WORKER, "--message", "Automatic rollback: the smoke test failed", "--yes"]);
    console.log("Rolled back.");
  }
}
