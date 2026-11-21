import { afterEach, describe, expect, it } from "vitest";

import { auditReport, closeFakeGithubs, EFFECT, fakeGithub, openSecurityIssue, runNight } from "./helpers/fake-github";
import { readFileSync } from "node:fs";

/**
 * The audit watch's safety: it sees every open audit-watch issue (paging, pull requests and hand-written issues
 * skipped), never closes anything after an incomplete audit, fails loudly on a GitHub error, and its workflow keeps
 * the narrow triggers and permissions. Nothing leaves 127.0.0.1.
 */
afterEach(closeFakeGithubs);

const EFFECT_ISSUE_BODY = "npm audit reports effect.\n\n<!-- audit-watch pkg=effect ids=1101 -->";
const PAGE_SIZE = 100;

describe("audit watch: which issues it touches", () => {
  it("leaves a hand-written security issue and a security pull request alone on a clean audit", async () => {
    const handWritten = openSecurityIssue(5, "Rotate the session secret.");
    const pullRequest = openSecurityIssue(6, "Bump effect. <!-- not audit-watch -->", {
      pull_request: { url: "https://example.test/pull/6" },
    });
    const prWithMarker = openSecurityIssue(8, EFFECT_ISSUE_BODY, { pull_request: { url: "https://example.test/8" } });
    const { apiUrl, writes } = await fakeGithub({ issues: [handWritten, pullRequest, prWithMarker] });

    await runNight(apiUrl, auditReport());
    expect(writes()).toEqual([]);
  });

  it("pages through 100 issues per page and closes the effect issue it finds on page 2", async () => {
    const others = Array.from({ length: PAGE_SIZE }, (_, i) => openSecurityIssue(1000 + i, `Hand-written ${i}.`));
    const effectIssue = openSecurityIssue(2000, EFFECT_ISSUE_BODY);
    const { apiUrl, world, writes } = await fakeGithub({ issues: [...others, effectIssue] });

    await runNight(apiUrl, auditReport());
    const listing = world.seen.filter((r) => r.method === "GET" && r.path === "/issues");
    expect(listing.map((r) => r.query.toString())).toEqual([
      "state=open&labels=security&per_page=100&page=1",
      "state=open&labels=security&per_page=100&page=2",
    ]);
    expect(writes().map((r) => `${r.method} ${r.path}`)).toEqual(["POST /issues/2000/comments", "PATCH /issues/2000"]);
    expect(writes()[1]?.body).toEqual({ state: "closed" });
  });
});

describe("audit watch: failures stop the run", () => {
  it("rejects naming the audit step when the audit is not JSON, and writes nothing", async () => {
    const { apiUrl, world, writes } = await fakeGithub({ issues: [openSecurityIssue(9, EFFECT_ISSUE_BODY)] });

    await expect(runNight(apiUrl, "npm ERR! network request to registry failed")).rejects.toThrow(
      /^audit step: npm audit gave no parseable JSON/,
    );
    await expect(runNight(apiUrl, JSON.stringify({ error: { code: "ENOTFOUND" } }))).rejects.toThrow(/^audit step:/);
    expect(writes()).toEqual([]);
    expect(world.seen).toEqual([]);
    expect(world.issues[0]?.state).toBe("open");
  });

  it("fails naming the package and status 500 when creating the issue fails", async () => {
    const { apiUrl, world } = await fakeGithub();
    world.failures.set("POST /issues", 500);

    await expect(runNight(apiUrl, auditReport(EFFECT))).rejects.toThrow(
      "create issue failed for effect: HTTP status 500",
    );
    expect(world.issues).toEqual([]);
  });
});

describe("the audit watch workflow", () => {
  const workflow = readFileSync(".github/workflows/audit-watch.yml", "utf8");
  const security = readFileSync(".github/workflows/security.yml", "utf8");
  const pins = (text: string) => text.match(/uses: \S+@[0-9a-f]{40} # v[\d.]+/g) ?? [];

  it("runs nightly at 07:00 UTC or by hand, never on push or pull request", () => {
    expect(workflow).toContain('- cron: "0 7 * * *"');
    expect(workflow).toMatch(/^ {2}workflow_dispatch:$/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
  });

  it("has only contents: read and issues: write, and uses no secret but GITHUB_TOKEN", () => {
    const permissions = workflow
      .match(/^permissions:\n((?: {2}.+\n)+)/m)?.[1]
      .trim()
      .split(/\n\s*/);
    expect(permissions).toEqual(["contents: read", "issues: write"]);
    expect(workflow.match(/secrets\.\w+/g)).toEqual(["secrets.GITHUB_TOKEN"]);
  });

  it("checks out next with the same pinned actions as security.yml and runs the watch script", () => {
    expect(workflow).toMatch(/with:\n {10}ref: next\n/);
    expect(pins(workflow)).toEqual(pins(security).slice(0, 2));
    expect(pins(workflow)).toEqual([
      "uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
      "uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0",
    ]);
    expect(workflow).toContain("run: npm ci --ignore-scripts");
    expect(workflow).toContain("run: node scripts/audit-watch.mjs");
    expect(workflow).toContain("concurrency: audit-watch");
  });
});
