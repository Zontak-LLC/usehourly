// The decisions behind the daily release (.github/workflows/daily-release.yml). The workflow runs git, gh and wrangler
// and asks this module what to do, so every rule here is unit-tested (src/__tests__/daily-release.test.ts).
//   node scripts/daily-release.mjs <command> [arg] < input
//     added-migrations         stdin: `git diff --name-status` lines   prints the added migration files, one per line
//     action                   stdin: JSON { hasChanges, addedMigrations, hasTinyPr }   prints skip | wait-for-tiny | release
//     verdict                  stdin: JSON statusCheckRollup (from `gh pr view`)   prints green | red | pending
//     body                     stdin: JSON { files, commits, rollbackVersion }   prints the release PR body
//     with-rollback <version>  stdin: an existing PR body   prints it with its `Rollback version:` line set
// No disk or network: it only reads stdin and prints.
import { pathToFileURL } from "node:url";

/** More commit subjects than this make the PR body unreadable; the changed-file list is the full truth anyway. */
export const MAX_LISTED_COMMITS = 50;

const MIGRATIONS_FOLDER = "migrations/";
const ROLLBACK_PREFIX = "Rollback version: ";
const GREEN_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);
const PENDING_STATES = new Set(["pending", "expected"]);

/**
 * The migration files a release would add, from `git diff --name-status` lines (`A\tmigrations/0042_x.sql`).
 * Only added files count: a migration that already shipped is on main, so it shows as unchanged or modified.
 * Returns an empty array when there are none.
 */
export function addedMigrations(nameStatusLines) {
  return nameStatusLines
    .map((line) => line.split("\t"))
    .filter(([status, path]) => status === "A" && path?.startsWith(MIGRATIONS_FOLDER))
    .map(([, path]) => path);
}

/**
 * What today's run does: `skip` when next has nothing main lacks, `wait-for-tiny` when the release adds a migration
 * or a release PR already waits for Tiny (everything else waits with it), otherwise `release`.
 */
export function releaseAction({ hasChanges, addedMigrations: migrations, hasTinyPr }) {
  if (!hasChanges) return "skip";
  if (migrations.length > 0 || hasTinyPr) return "wait-for-tiny";
  return "release";
}

/** One check as green, red or pending. Check runs carry status/conclusion; older commit statuses carry state. */
function checkState(check) {
  if (check?.state !== undefined) {
    const state = String(check.state).toLowerCase();
    if (state === "success") return "green";
    return PENDING_STATES.has(state) ? "pending" : "red";
  }
  if (String(check?.status).toLowerCase() !== "completed") return "pending";
  return GREEN_CONCLUSIONS.has(String(check.conclusion).toLowerCase()) ? "green" : "red";
}

/**
 * The verdict on a pull request's checks: `red` when any check failed (failure, cancelled, timed_out, or any other
 * unhappy end), `pending` while any is still queued or running, `green` only when every check ended success, neutral
 * or skipped. An empty list is `pending`, never `green`: the checks may not have started yet.
 */
export function checksVerdict(checkRuns) {
  const states = checkRuns.map(checkState);
  if (states.includes("red")) return "red";
  if (states.length === 0 || states.includes("pending")) return "pending";
  return "green";
}

/**
 * The release PR body: the changed files, the commit subjects (newest first, at most MAX_LISTED_COMMITS), then the
 * `Rollback version:` line the after-deploy check rolls back to.
 */
export function releaseBody({ files, commits, rollbackVersion }) {
  const listed = commits.slice(0, MAX_LISTED_COMMITS);
  const hidden = commits.length - listed.length;
  const lines = [
    "Daily release of `next` to `main`. The changed files are the full truth; squash releases keep commits that already shipped in the list below.",
    "",
    "## Changed files",
    ...files.map((file) => `- \`${file}\``),
    "",
    "## Commits",
    ...listed.map((subject) => `- ${subject}`),
    ...(hidden > 0 ? [`(and ${hidden} more)`] : []),
  ];
  return withRollbackLine(lines.join("\n"), rollbackVersion);
}

/** The PR body with exactly one `Rollback version:` line, at the end: an older one is replaced, not repeated. */
export function withRollbackLine(body, rollbackVersion) {
  const kept = body
    .split("\n")
    .filter((line) => !line.startsWith(ROLLBACK_PREFIX))
    .join("\n")
    .trimEnd();
  return `${kept}\n\n${ROLLBACK_PREFIX}${rollbackVersion}\n`;
}

const nonEmptyLines = (text) => text.split("\n").filter((line) => line.trim() !== "");

const COMMANDS = {
  "added-migrations": (input) => addedMigrations(nonEmptyLines(input)).join("\n"),
  action: (input) => releaseAction(JSON.parse(input)),
  verdict: (input) => checksVerdict(JSON.parse(input) ?? []),
  body: (input) => releaseBody(JSON.parse(input)),
  "with-rollback": (input, version) => withRollbackLine(input, version),
};

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, argument] = process.argv.slice(2);
  const run = COMMANDS[command];
  if (!run) {
    console.error(`Unknown command "${command}". Commands: ${Object.keys(COMMANDS).join(", ")}`);
    process.exit(1);
  }
  if (command === "with-rollback" && !argument) {
    console.error("with-rollback needs the rollback version id");
    process.exit(1);
  }
  const output = run(await readStdin(), argument);
  if (output) console.log(output.trimEnd());
}
