import { describe, expect, it } from "vitest";

import {
  addedMigrations,
  checksVerdict,
  MAX_LISTED_COMMITS,
  releaseAction,
  releaseBody,
  withRollbackLine,
} from "../../scripts/daily-release.mjs";

const run = (status: string, conclusion: string | null = null) => ({ status, conclusion });

describe("which migrations a daily release would add", () => {
  it("lists only files added under migrations/", () => {
    expect(addedMigrations(["A\tmigrations/0042_x.sql", "M\tsrc/a.ts"])).toEqual(["migrations/0042_x.sql"]);
  });

  it("is empty for a changed migration that already shipped, or files outside migrations/", () => {
    expect(addedMigrations(["M\tmigrations/0001_init.sql"])).toEqual([]);
    expect(addedMigrations(["A\tsrc/new.ts", "D\tdocs/old.md"])).toEqual([]);
    expect(addedMigrations([])).toEqual([]);
  });
});

describe("what today's daily release does", () => {
  it("skips when next has nothing new, even with added migrations", () => {
    expect(releaseAction({ hasChanges: false, addedMigrations: [], hasTinyPr: false })).toBe("skip");
    expect(releaseAction({ hasChanges: false, addedMigrations: ["migrations/0042_x.sql"], hasTinyPr: true })).toBe(
      "skip",
    );
  });

  it("waits for Tiny when the release adds a migration or a release PR already waits for Tiny", () => {
    expect(releaseAction({ hasChanges: true, addedMigrations: ["migrations/0042_x.sql"], hasTinyPr: false })).toBe(
      "wait-for-tiny",
    );
    expect(releaseAction({ hasChanges: true, addedMigrations: [], hasTinyPr: true })).toBe("wait-for-tiny");
  });

  it("releases when there are changes, no added migration and no PR waiting for Tiny", () => {
    expect(releaseAction({ hasChanges: true, addedMigrations: [], hasTinyPr: false })).toBe("release");
  });
});

describe("the verdict on the release PR's checks", () => {
  it("is green when every run ended success, neutral or skipped (gh prints them upper case)", () => {
    expect(checksVerdict([run("completed", "success"), run("completed", "neutral"), run("completed", "skipped")])).toBe(
      "green",
    );
    expect(checksVerdict([run("COMPLETED", "SUCCESS"), { state: "SUCCESS" }])).toBe("green");
  });

  it("is red when any run failed, was cancelled or timed out, even while others still run", () => {
    for (const conclusion of ["failure", "cancelled", "timed_out", "FAILURE"]) {
      expect(checksVerdict([run("completed", "success"), run("completed", conclusion)])).toBe("red");
    }
    expect(checksVerdict([run("in_progress"), run("completed", "failure")])).toBe("red");
    expect(checksVerdict([{ state: "ERROR" }])).toBe("red");
  });

  it("is pending while any run is queued or in progress and none is red", () => {
    expect(checksVerdict([run("completed", "success"), run("queued")])).toBe("pending");
    expect(checksVerdict([run("IN_PROGRESS"), run("completed", "skipped")])).toBe("pending");
    expect(checksVerdict([{ state: "PENDING" }])).toBe("pending");
  });

  it("is pending, never green, when there are no checks yet", () => {
    expect(checksVerdict([])).toBe("pending");
  });
});

describe("the release PR body", () => {
  it("lists the changed files, the commit subjects and the rollback version", () => {
    const body = releaseBody({ files: ["src/a.ts"], commits: ["A", "B"], rollbackVersion: "v-123" });
    expect(body).toContain("src/a.ts");
    expect(body).toMatch(/^- A$/m);
    expect(body).toMatch(/^- B$/m);
    expect(body).toMatch(/^Rollback version: v-123$/m);
  });

  it(`lists at most ${MAX_LISTED_COMMITS} commits, newest first as given`, () => {
    const commits = Array.from({ length: 60 }, (_, i) => `commit-${i + 1}`);
    const body = releaseBody({ files: ["src/a.ts"], commits, rollbackVersion: "v-1" });
    const listed = body.match(/^- commit-\d+$/gm) ?? [];
    expect(MAX_LISTED_COMMITS).toBe(50);
    expect(listed).toHaveLength(50);
    expect(listed[0]).toBe("- commit-1");
    expect(listed[49]).toBe("- commit-50");
    expect(body).toContain("(and 10 more)");
  });
});

describe("setting the rollback version on a release PR opened earlier", () => {
  it("adds the line when the body has none", () => {
    expect(withRollbackLine("Opened by hand.", "v-9")).toBe("Opened by hand.\n\nRollback version: v-9\n");
  });

  it("replaces an older line instead of adding a second one", () => {
    const body = withRollbackLine("Notes\n\nRollback version: v-old\n", "v-new");
    expect(body.match(/^Rollback version: /gm)).toHaveLength(1);
    expect(body).toContain("Rollback version: v-new");
    expect(body).not.toContain("v-old");
  });
});
