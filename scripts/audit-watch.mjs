// The nightly audit watch (.github/workflows/audit-watch.yml): runs the production audit on `next` and keeps one
// GitHub issue (label `security`) per high or critical package, opening, updating and closing it.
//
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name node scripts/audit-watch.mjs
//
// The decisions live in audit-watch-plan.mjs; this file runs npm and the GitHub REST calls. It exits 1 when the audit
// gives no JSON or a GitHub call fails, and never closes an issue after an incomplete audit.
// Tested by src/__tests__/audit-watch-journey.test.ts and audit-watch-listing-journey.test.ts.

import {
  closingComment,
  findingsFromAudit,
  issueBody,
  issueTitle,
  parseMarker,
  planIssueActions,
  updateComment,
  withMarker,
} from "./audit-watch-plan.mjs";
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";

const LABEL = "security";
const ASSIGNEE = "dzontak";
const PAGE_SIZE = 100;
const HTTP_NOT_FOUND = 404;
const NPM_OUTPUT_LIMIT = 64 * 1024 * 1024;

/** Runs npm and gives back its stdout and stderr; a non-zero exit is normal for `npm audit` with findings. */
function runNpm(args) {
  return new Promise((resolve) => {
    execFile("npm", args, { encoding: "utf8", maxBuffer: NPM_OUTPUT_LIMIT }, (_exitError, stdout, stderr) =>
      resolve({ stdout: stdout ?? "", stderr: stderr ?? "" }),
    );
  });
}

/** The raw `npm audit` JSON text at the CI level, production dependencies only. */
async function readAudit() {
  const { stdout, stderr } = await runNpm(["audit", "--omit=dev", "--audit-level=high", "--json"]);
  return stdout.trim() ? stdout : stderr;
}

/** The `npm ls <pkg>` tree that shows which dependency pulls the package in. */
async function readChain(pkg) {
  const { stdout, stderr } = await runNpm(["ls", pkg, "--omit=dev", "--all"]);
  return stdout.trim() || stderr.trim() || "(npm ls printed nothing)";
}

/** The parsed audit report; throws (naming the audit step) when npm gave no usable JSON, so nothing gets closed. */
function parseAudit(text) {
  let report;
  try {
    report = JSON.parse(text);
  } catch (error) {
    throw new Error(`audit step: npm audit gave no parseable JSON (${error.message})`);
  }
  if (typeof report?.vulnerabilities !== "object" || report.vulnerabilities === null)
    throw new Error(`audit step: npm audit JSON has no vulnerabilities map (${String(text).slice(0, 200)})`);
  return report;
}

/** A GitHub REST caller for one repo. Throws on a non-2xx status (except the statuses in `allow`), naming the step. */
function githubClient({ apiUrl, token, repo }) {
  return async function request(method, path, { body, step, pkg, allow = [] }) {
    const response = await fetch(`${apiUrl}/repos/${repo}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "audit-watch",
        "x-github-api-version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok && !allow.includes(response.status)) {
      const forPackage = pkg ? ` for ${pkg}` : "";
      throw new Error(`${step} failed${forPackage}: HTTP status ${response.status}`);
    }
    return response;
  };
}

/** Every open `security` issue (pull requests skipped), page by page while a page comes back full. */
async function listSecurityIssues(request) {
  const issues = [];
  for (let page = 1; ; page++) {
    const query = `state=open&labels=${LABEL}&per_page=${PAGE_SIZE}&page=${page}`;
    const response = await request("GET", `/issues?${query}`, { step: `list issues (page ${page})` });
    const batch = await response.json();
    issues.push(...batch);
    if (batch.length < PAGE_SIZE) return issues.filter((issue) => !issue.pull_request);
  }
}

/** The open audit-watch issues as `{ number, pkg, ids, body }`; issues without the marker are left alone. */
async function listWatchedIssues(request) {
  const issues = await listSecurityIssues(request);
  return issues
    .map((issue) => ({ number: issue.number, body: issue.body ?? "", marker: parseMarker(issue.body) }))
    .filter((issue) => issue.marker)
    .map(({ number, body, marker }) => ({ number, body, pkg: marker.pkg, ids: marker.ids }));
}

/** Creates the `security` label when the repo does not have it yet. */
async function ensureLabel(request) {
  const response = await request("GET", `/labels/${LABEL}`, { step: "read label", allow: [HTTP_NOT_FOUND] });
  if (response.status !== HTTP_NOT_FOUND) return;
  const body = { name: LABEL, color: "d73a4a", description: "Security finding" };
  await request("POST", "/labels", { body, step: "create label" });
}

async function openIssue({ request, readChain: chainOf, action }) {
  const { finding, pkg } = action;
  const body = {
    title: issueTitle(finding),
    body: issueBody(finding, await chainOf(pkg)),
    labels: [LABEL],
    assignees: [ASSIGNEE],
  };
  await request("POST", "/issues", { body, step: "create issue", pkg });
}

async function updateIssue({ request, action, oldBody }) {
  const { finding, pkg, number } = action;
  await request("POST", `/issues/${number}/comments`, { body: { body: updateComment(finding) }, step: "comment", pkg });
  const body = { body: withMarker(oldBody, finding) };
  await request("PATCH", `/issues/${number}`, { body, step: "update issue body", pkg });
}

async function closeIssue({ request, action }) {
  const { pkg, number } = action;
  await request("POST", `/issues/${number}/comments`, { body: { body: closingComment(pkg) }, step: "comment", pkg });
  await request("PATCH", `/issues/${number}`, { body: { state: "closed" }, step: "close issue", pkg });
}

/**
 * One nightly run: reads the audit, lists the open audit-watch issues, and opens, updates or closes them. `readAudit`
 * returns the `npm audit --json` text and `readChain(pkg)` the `npm ls` text (both injectable for tests). Returns the
 * actions it carried out. Throws when the audit is not JSON (before any GitHub call) or a GitHub call fails.
 */
export async function runAuditWatch({ readAudit: auditText, readChain: chainOf, apiUrl, token, repo }) {
  const findings = findingsFromAudit(parseAudit(await auditText()));
  const request = githubClient({ apiUrl, token, repo });
  const openIssues = await listWatchedIssues(request);
  const actions = planIssueActions({ findings, openIssues });
  if (actions.some((action) => action.kind === "open")) await ensureLabel(request);
  for (const action of actions) {
    if (action.kind === "open") await openIssue({ request, readChain: chainOf, action });
    const oldBody = openIssues.find((issue) => issue.number === action.number)?.body;
    if (action.kind === "comment") await updateIssue({ request, action, oldBody });
    if (action.kind === "close") await closeIssue({ request, action });
  }
  return actions;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_API_URL } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    console.error("audit-watch: GITHUB_TOKEN and GITHUB_REPOSITORY must be set.");
    process.exit(1);
  }
  try {
    const options = { readAudit, readChain, token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY };
    const actions = await runAuditWatch({ ...options, apiUrl: GITHUB_API_URL || "https://api.github.com" });
    for (const action of actions) console.log(`audit-watch: ${action.kind} ${action.pkg}`);
    if (actions.length === 0) console.log("audit-watch: nothing changed.");
  } catch (error) {
    console.error(`audit-watch: ${error.message}`);
    process.exit(1);
  }
}
