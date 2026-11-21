import { describe, expect, it } from "vitest";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The workflow itself only runs on GitHub; these pin the parts of it that keep a release safe, and the commands it
// calls in scripts/daily-release.mjs.
const workflow = readFileSync(".github/workflows/daily-release.yml", "utf8");
const steps = workflow.split(/\n {6}- /).slice(1);
const stepNamed = (name: string) => steps.find((step) => step.startsWith(`name: ${name}`)) ?? "";

const cli = (args: string[], input: string) =>
  execFileSync(process.execPath, ["scripts/daily-release.mjs", ...args], { input, encoding: "utf8" });

describe("the daily release workflow", () => {
  it("runs from two UTC crons, kept to one run at START_HOUR_ET in New York", () => {
    expect(workflow.match(/- cron: "[^"]+"/g)).toEqual(['- cron: "0 9 * * *"', '- cron: "0 10 * * *"']);
    expect(workflow).toContain('START_HOUR_ET: "05"');
    const hourCheck = stepNamed("Run once a day");
    expect(hourCheck).toContain("if: github.event_name == 'schedule'");
    expect(hourCheck).toContain("TZ=America/New_York date +%H");
  });

  it("has exactly the four job permissions", () => {
    const permissions = workflow
      .match(/ {4}permissions:\n((?: {6}.+\n)+)/)?.[1]
      .trim()
      .split(/\n\s*/);
    expect(permissions).toEqual(["contents: read", "issues: write", "pull-requests: write", "actions: read"]);
  });

  it("uses RELEASE_TOKEN only to open and merge the PR, after the empty-token check, and never echoes a secret", () => {
    const uses = steps.filter((step) => step.includes("secrets.RELEASE_TOKEN")).map((step) => step.split("\n")[0]);
    expect(uses).toEqual(["name: Release token is set", "name: Open the release PR", "name: Merge the release PR"]);
    const asGhToken = /GH_TOKEN: \$\{\{ secrets\.RELEASE_TOKEN \}\}/;
    expect(stepNamed("Open the release PR")).toMatch(asGhToken);
    expect(stepNamed("Merge the release PR")).toMatch(asGhToken);
    expect(workflow).not.toMatch(/echo[^\n]*secrets\./);
  });

  it("skips every writing step in a dry run", () => {
    expect(workflow).toMatch(
      /DRY_RUN: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.dry_run == true \}\}/,
    );
    for (const name of [
      "Write the release PR body",
      "Open the release PR",
      "Put the rollback version",
      "A migration waits for Tiny",
      "Merge the release PR",
      "Roll back to the recorded version",
      "Open the issue",
    ]) {
      expect(stepNamed(name), name).toContain("env.DRY_RUN != 'true'");
    }
  });

  it("judges changes and migrations by two-dot content diffs", () => {
    const plan = stepNamed("Decide what to release");
    expect(plan).toContain("git diff --quiet origin/main origin/next");
    expect(plan).toContain("git diff --name-status --diff-filter=A origin/main origin/next -- migrations/");
  });

  it("finds the deploy run by the merge commit, and rolls back only after a failed site or health check", () => {
    const find = stepNamed("Find the deploy run");
    expect(find).toContain('--commit "$merge_sha"');
    expect(find).toContain("RUN_APPEAR_TIMEOUT_MINUTES * 60");
    expect(find).toContain("ISSUE_TITLE=Daily release: deploy run not found");
    expect(find).not.toContain("wrangler rollback");
    const rollback = stepNamed("Roll back to the recorded version");
    expect(rollback).toContain("steps.live.outputs.healthy == 'false'");
    expect(rollback).toContain("ISSUE_TITLE=Daily release rolled back");
    expect(steps.filter((step) => step.includes("wrangler rollback"))).toEqual([rollback]);
    expect(steps.at(-1)).toContain("if: always() && env.ISSUE_TITLE != ''");
  });
});

describe("the commands the workflow calls", () => {
  it("lists added migrations from git's name-status lines", () => {
    expect(cli(["added-migrations"], "A\tmigrations/0042_x.sql\nM\tsrc/a.ts\n")).toBe("migrations/0042_x.sql\n");
  });

  it("answers the action and the checks verdict", () => {
    const input = JSON.stringify({ hasChanges: true, addedMigrations: [], hasTinyPr: false });
    expect(cli(["action"], input)).toBe("release\n");
    expect(cli(["verdict"], "[]")).toBe("pending\n");
    expect(cli(["verdict"], JSON.stringify([{ status: "COMPLETED", conclusion: "SUCCESS" }]))).toBe("green\n");
  });

  it("writes the PR body and replaces its rollback line", () => {
    const body = cli(["body"], JSON.stringify({ files: ["src/a.ts"], commits: ["A"], rollbackVersion: "v-1" }));
    expect(body).toMatch(/Rollback version: v-1\n$/);
    expect(cli(["with-rollback", "v-2"], "Notes\nRollback version: v-1\n")).toBe("Notes\n\nRollback version: v-2\n");
  });
});
