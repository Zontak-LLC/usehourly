import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

// The release changes the live database. Before any migration runs, the deploy job must print a D1 Time Travel
// bookmark, so a damaged database is restored to that exact point instead of a guessed timestamp.

const BOOKMARK_STEP = "Record the database restore point (D1 Time Travel bookmark)";
const ROLLBACK_CHECK_STEP = "Check automatic rollback is on";
const MIGRATIONS_STEP = "Apply database migrations";
/** A GitHub Actions expression as written in the workflow, e.g. `${{ vars.X }}`. */
const actionsExpression = (expression: string) => `\${{ ${expression} }}`;
const TOKEN_ENV = `CLOUDFLARE_API_TOKEN: ${actionsExpression("secrets.CLOUDFLARE_API_TOKEN")}`;
const ROLLBACK_ENV = `SMOKE_ROLLBACK: ${actionsExpression("vars.SMOKE_ROLLBACK")}`;
const STEP_START = "      - ";

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const workflow = readRepoFile(".github/workflows/ci.yml");

/** The lines of one top-level job, from `  <job>:` to the next job key or the end of the file. */
function jobLines(job: string): string[] {
  const lines = workflow.split("\n");
  const start = lines.indexOf(`  ${job}:`);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}[\w-]+:\s*$/.test(line));
  return lines.slice(start, end < 0 ? undefined : start + 1 + end);
}

/** Each step of a job as its own block of text, in order. */
function stepsOf(job: string): string[] {
  const steps: string[] = [];
  for (const line of jobLines(job)) {
    if (line.startsWith(STEP_START)) steps.push(line);
    else if (steps.length > 0) steps[steps.length - 1] += `\n${line}`;
  }
  return steps;
}

/** The position of the step whose `name:` is exactly `name`, or -1. */
function stepNamed(steps: string[], name: string): number {
  const isNameLine = (line: string) => line.replace(/^\s*-?\s*/, "") === `name: ${name}`;
  return steps.findIndex((step) => step.split("\n").some(isNameLine));
}

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("a release records a database restore point before it migrates", () => {
  const deploySteps = stepsOf("deploy");

  it("prints the Time Travel bookmark in the deploy job before the migrations", () => {
    const bookmarkIndex = stepNamed(deploySteps, BOOKMARK_STEP);
    const migrationsIndex = stepNamed(deploySteps, MIGRATIONS_STEP);
    expect(bookmarkIndex, `index of "${BOOKMARK_STEP}" in deploy`).toBeGreaterThanOrEqual(0);
    expect(migrationsIndex, `index of "${MIGRATIONS_STEP}" in deploy`).toBeGreaterThanOrEqual(0);
    expect(bookmarkIndex).toBeLessThan(migrationsIndex);
  });

  it("the bookmark step reads Time Travel with the token and fails the release when it cannot", () => {
    const step = deploySteps[stepNamed(deploySteps, BOOKMARK_STEP)] ?? "";
    expect(step).toContain("wrangler d1 time-travel info");
    expect(step).toContain(TOKEN_ENV);
    expect(step).toContain("--bookmark=");
    expect(step).not.toContain("continue-on-error");
  });

  it("the bookmark step lives only in deploy, not in the check or e2e jobs", () => {
    for (const job of ["check", "e2e"]) {
      expect(stepNamed(stepsOf(job), BOOKMARK_STEP), job).toBe(-1);
    }
    expect(countOf(workflow, BOOKMARK_STEP)).toBe(1);
  });

  it("warns, without failing, when automatic rollback is off", () => {
    const checkIndex = stepNamed(deploySteps, ROLLBACK_CHECK_STEP);
    expect(checkIndex, `index of "${ROLLBACK_CHECK_STEP}" in deploy`).toBeGreaterThanOrEqual(0);
    expect(checkIndex).toBeLessThan(stepNamed(deploySteps, MIGRATIONS_STEP));
    const step = deploySteps[checkIndex];
    expect(step).toContain("SMOKE_ROLLBACK");
    expect(step).toContain("::warning::Automatic rollback is OFF");
    expect(step).not.toContain("exit 1");
  });

  it("the deploy job still reads SMOKE_ROLLBACK from the production environment", () => {
    expect(jobLines("deploy").join("\n")).toContain(ROLLBACK_ENV);
  });

  it("migrations run from one step only, so none can run before the bookmark", () => {
    expect(countOf(workflow, "apply DB --remote")).toBe(1);
    expect(deploySteps[stepNamed(deploySteps, MIGRATIONS_STEP)]).toContain("apply DB --remote");
  });

  it("the operations guide names the bookmark step and how to restore with it", () => {
    const operations = readRepoFile("docs/operations.md");
    expect(operations).toContain(BOOKMARK_STEP);
    expect(operations).toContain("--bookmark=");
  });
});
