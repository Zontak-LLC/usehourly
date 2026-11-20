// What the nightly audit watch (.github/workflows/audit-watch.yml) should do with GitHub issues, decided from
// `npm audit --json` output and the open audit-watch issues. No disk or network: scripts/audit-watch.mjs runs the
// commands and the GitHub calls. Tested by src/__tests__/audit-watch-journey.test.ts.

/** The CI level (`npm run audit:prod` uses --audit-level=high): only these severities fail a PR. */
const FAILING_SEVERITIES = new Set(["high", "critical"]);
const NO_FIX = "no fix published yet";
const FIX_BY_AUDIT_FIX = "available through `npm audit fix`";
const MARKER_PATTERN = /<!-- audit-watch pkg=(\S+) ids=(\S*) -->/g;

const isAdvisory = (via) => typeof via === "object" && via !== null;
const byId = (a, b) => a.localeCompare(b, "en", { numeric: true });

/** True for the package that carries an advisory itself; a parent lists only package names (strings) in `via`. */
const carriesAdvisory = (entry) =>
  FAILING_SEVERITIES.has(entry?.severity) && Array.isArray(entry.via) && entry.via.some(isAdvisory);

/** The fix as one line of text, from npm's `fixAvailable` (an object, `true` or `false`). */
function describeFix(fixAvailable) {
  if (isAdvisory(fixAvailable)) return `${fixAvailable.name}@${fixAvailable.version}`;
  return fixAvailable === true ? FIX_BY_AUDIT_FIX : NO_FIX;
}

function toFinding(entry) {
  const advisories = entry.via
    .filter(isAdvisory)
    .map((via) => ({ id: String(via.source), title: String(via.title ?? ""), url: String(via.url ?? "") }))
    .sort((a, b) => byId(a.id, b.id));
  return {
    pkg: entry.name,
    severity: entry.severity,
    range: entry.range,
    advisories,
    ids: advisories.map((advisory) => advisory.id),
    fix: describeFix(entry.fixAvailable),
  };
}

/**
 * The high and critical findings in `npm audit --json` output (the v2 `vulnerabilities` map), one per package that
 * carries an advisory, sorted by package name. Parents that only depend on a vulnerable package are left out: they
 * show up in the carrier's `npm ls` chain. Returns an empty array for a clean audit.
 */
export function findingsFromAudit(auditJson) {
  return Object.values(auditJson?.vulnerabilities ?? {})
    .filter(carriesAdvisory)
    .map(toFinding)
    .sort((a, b) => a.pkg.localeCompare(b.pkg));
}

/** The marker line that fingerprints a finding: its package and its sorted advisory ids. */
const markerFor = ({ pkg, ids }) => `<!-- audit-watch pkg=${pkg} ids=${ids.join(",")} -->`;

/**
 * The fingerprint in the LAST audit-watch marker of `text`, as `{ pkg, ids }`, or `undefined` when there is none.
 */
export function parseMarker(text) {
  const matches = [...String(text ?? "").matchAll(MARKER_PATTERN)];
  const last = matches.at(-1);
  if (!last) return undefined;
  return { pkg: last[1], ids: last[2] ? last[2].split(",") : [] };
}

const sameIds = (a, b) => a.length === b.length && a.every((id, index) => id === b[index]);

/**
 * What to do on GitHub: `open` a new issue for a finding with no open issue, `comment` when its advisory ids changed,
 * `close` an open issue whose package the audit no longer reports. Nothing for a finding whose issue already holds
 * the same ids, so an unchanged night writes nothing. `openIssues` is `[{ number, pkg, ids }]` (audit-watch issues
 * only). Returns the actions, opens and comments first.
 */
export function planIssueActions({ findings, openIssues }) {
  const actions = [];
  for (const finding of findings) {
    const issue = openIssues.find((open) => open.pkg === finding.pkg);
    if (!issue) actions.push({ kind: "open", pkg: finding.pkg, finding });
    else if (!sameIds(finding.ids, [...issue.ids].sort(byId)))
      actions.push({ kind: "comment", pkg: finding.pkg, number: issue.number, finding });
  }
  const reported = new Set(findings.map((finding) => finding.pkg));
  for (const issue of openIssues) {
    if (!reported.has(issue.pkg)) actions.push({ kind: "close", pkg: issue.pkg, number: issue.number });
  }
  return actions;
}

const advisoryLines = (finding) =>
  finding.advisories.map((advisory) => `- ${advisory.title} (${advisory.url}), vulnerable range \`${finding.range}\``);

/** The issue title, e.g. `npm audit: effect (high)`. */
export const issueTitle = (finding) => `npm audit: ${finding.pkg} (${finding.severity})`;

/** The new issue's body: why it matters, the advisories, the fix, the `npm ls` chain, then the marker line. */
export function issueBody(finding, chain) {
  return [
    `\`npm audit --omit=dev\` on \`next\` reports \`${finding.pkg}\` at ${finding.severity}, at or above the CI level, so PR checks will fail on it.`,
    "",
    "Advisories:",
    ...advisoryLines(finding),
    "",
    `Fix: ${finding.fix}`,
    "",
    `\`npm ls ${finding.pkg} --omit=dev --all\`:`,
    "```",
    chain.trim(),
    "```",
    "",
    markerFor(finding),
  ].join("\n");
}

/** The comment posted when a package's advisories change, with the new marker for history. */
export function updateComment(finding) {
  return [
    `The advisories for \`${finding.pkg}\` changed. Now:`,
    ...advisoryLines(finding),
    "",
    `Fix: ${finding.fix}`,
    "",
    markerFor(finding),
  ].join("\n");
}

/** The comment posted just before an issue is closed. */
export const closingComment = (pkg) => `npm audit on next no longer reports ${pkg}; closing.`;

/** `body` with its audit-watch marker line(s) replaced by the marker for `finding`, so the body holds the current ids. */
export function withMarker(body, finding) {
  const withoutMarker = String(body ?? "")
    .replace(MARKER_PATTERN, "")
    .trimEnd();
  return `${withoutMarker}\n\n${markerFor(finding)}`;
}
