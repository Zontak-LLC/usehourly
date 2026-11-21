import { afterEach, describe, expect, it } from "vitest";

import {
  auditReport,
  chainFor,
  closeFakeGithubs,
  EFFECT,
  EFFECT_PARENT,
  fakeGithub,
  NEXT_HIGH,
  openSecurityIssue,
  runNight,
  UUID_MODERATE,
} from "./helpers/fake-github";

/**
 * The nightly audit watch (scripts/audit-watch.mjs) over several nights against a fake GitHub API: a new high
 * warning becomes one issue, an unchanged night writes nothing, a new advisory updates the issue, and a clean audit
 * closes it. The audit and `npm ls` outputs are stubs; nothing leaves 127.0.0.1.
 */
afterEach(closeFakeGithubs);

const ISSUES = `/issues`;
const EFFECT_WITH_SECOND_ADVISORY = {
  ...EFFECT,
  via: [
    ...EFFECT.via,
    { ...EFFECT.via[0], source: 1102, title: "effect advisory 1102", url: "https://github.com/advisories/GHSA-x" },
  ],
};

describe("audit watch: the first night", () => {
  it("opens exactly one issue for a new high warning, labelled, assigned, with range, fix, chain and marker", async () => {
    const { apiUrl, world, writes } = await fakeGithub();
    await runNight(apiUrl, auditReport(EFFECT));

    expect(writes().map((r) => `${r.method} ${r.path}`)).toEqual([`POST ${ISSUES}`]);
    const [created] = writes();
    expect(created?.body.title).toBe("npm audit: effect (high)");
    expect(created?.body.labels).toEqual(["security"]);
    expect(created?.body.assignees).toEqual(["dzontak"]);
    const body = String(created?.body.body);
    expect(body).toContain("`npm audit --omit=dev` on `next`");
    expect(body).toContain("<=3.22.0");
    expect(body).toContain("Fix: @prisma/config@7.9.0");
    expect(body).toContain(chainFor("effect"));
    expect(body).toContain("<!-- audit-watch pkg=effect ids=");
    expect(body.trim().split("\n").at(-1)).toBe("<!-- audit-watch pkg=effect ids=1101 -->");
    expect(world.issues).toHaveLength(1);
  });

  it("opens no issue for a parent that only depends on the vulnerable package", async () => {
    const { apiUrl, writes } = await fakeGithub();
    await runNight(apiUrl, auditReport(EFFECT, EFFECT_PARENT));

    const posts = writes().filter((r) => r.path === ISSUES);
    expect(posts.map((r) => r.body.title)).toEqual(["npm audit: effect (high)"]);
  });

  it("opens no issue for a moderate finding", async () => {
    const { apiUrl, writes } = await fakeGithub();
    await runNight(apiUrl, auditReport(UUID_MODERATE));
    expect(writes()).toEqual([]);

    await runNight(apiUrl, auditReport(EFFECT, UUID_MODERATE));
    expect(writes().map((r) => r.body.title)).toEqual(["npm audit: effect (high)"]);
  });

  it("opens two issues when two packages are high at once, one per package", async () => {
    const { apiUrl, writes } = await fakeGithub();
    await runNight(apiUrl, auditReport(EFFECT, NEXT_HIGH));

    expect(writes().map((r) => `${r.method} ${r.path} ${r.body.title}`)).toEqual([
      `POST ${ISSUES} npm audit: effect (high)`,
      `POST ${ISSUES} npm audit: next (high)`,
    ]);
    expect(String(writes()[1]?.body.body)).toContain("Fix: no fix published yet");
  });

  it("creates the security label first when the repo lacks it", async () => {
    const { apiUrl, world, writes } = await fakeGithub({ hasLabel: false });
    await runNight(apiUrl, auditReport(EFFECT));

    expect(world.seen.map((r) => `${r.method} ${r.path}`)).toContain("GET /labels/security");
    expect(writes().map((r) => `${r.method} ${r.path}`)).toEqual(["POST /labels", `POST ${ISSUES}`]);
    expect(writes()[0]?.body.name).toBe("security");
  });
});

describe("audit watch: later nights", () => {
  it("writes nothing on a second night with the same findings", async () => {
    const { apiUrl, writes } = await fakeGithub();
    await runNight(apiUrl, auditReport(EFFECT, EFFECT_PARENT, UUID_MODERATE));
    const firstNight = writes().length;

    await runNight(apiUrl, auditReport(EFFECT, EFFECT_PARENT, UUID_MODERATE));
    expect(writes()).toHaveLength(firstNight);
  });

  it("comments once and rewrites the body marker when a new advisory id appears, then stays quiet", async () => {
    const { apiUrl, world, writes } = await fakeGithub();
    await runNight(apiUrl, auditReport(EFFECT));
    const number = world.issues[0]?.number;

    await runNight(apiUrl, auditReport(EFFECT_WITH_SECOND_ADVISORY));
    const secondNight = writes().slice(1);
    expect(secondNight.map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST /issues/${number}/comments`,
      `PATCH /issues/${number}`,
    ]);
    const newMarker = "<!-- audit-watch pkg=effect ids=1101,1102 -->";
    expect(String(secondNight[0]?.body.body)).toContain(newMarker);
    expect(String(secondNight[0]?.body.body)).toContain("effect advisory 1102");
    const patchedBody = String(secondNight[1]?.body.body);
    expect(patchedBody.match(/<!-- audit-watch/g)).toHaveLength(1);
    expect(patchedBody.trim().split("\n").at(-1)).toBe(newMarker);
    expect(patchedBody).toContain(chainFor("effect"));
    expect(world.issues).toHaveLength(1);

    await runNight(apiUrl, auditReport(EFFECT_WITH_SECOND_ADVISORY));
    expect(writes()).toHaveLength(3);
  });

  it("closes the issue with one comment and one PATCH when the audit is clean again", async () => {
    const { apiUrl, world, writes } = await fakeGithub();
    await runNight(apiUrl, auditReport(EFFECT));
    const number = world.issues[0]?.number;

    await runNight(apiUrl, auditReport());
    const cleanNight = writes().slice(1);
    expect(cleanNight.map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST /issues/${number}/comments`,
      `PATCH /issues/${number}`,
    ]);
    expect(cleanNight[0]?.body).toEqual({ body: "npm audit on next no longer reports effect; closing." });
    expect(cleanNight[1]?.body).toEqual({ state: "closed" });
    expect(world.issues[0]?.state).toBe("closed");
  });

  it("closes only the package that is gone and keeps the other open", async () => {
    const { apiUrl, world, writes } = await fakeGithub();
    await runNight(apiUrl, auditReport(EFFECT, NEXT_HIGH));

    await runNight(apiUrl, auditReport(NEXT_HIGH));
    expect(
      writes()
        .slice(2)
        .map((r) => `${r.method} ${r.path}`),
    ).toEqual([`POST /issues/${world.issues[0]?.number}/comments`, `PATCH /issues/${world.issues[0]?.number}`]);
    expect(world.issues.map((i) => `${i.title} ${i.state}`)).toEqual([
      "npm audit: effect (high) closed",
      "npm audit: next (high) open",
    ]);
  });

  it("matches an issue by its marker, never by title", async () => {
    const renamed = openSecurityIssue(7, "Renamed by hand.\n\n<!-- audit-watch pkg=effect ids=1101 -->", {
      title: "something else",
    });
    const { apiUrl, writes } = await fakeGithub({ issues: [renamed] });
    await runNight(apiUrl, auditReport(EFFECT));
    expect(writes()).toEqual([]);
  });
});
