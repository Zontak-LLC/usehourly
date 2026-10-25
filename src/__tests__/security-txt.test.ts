import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

const DAY_MS = 86_400_000;
const CANONICAL = "https://usehourly.app/.well-known/security.txt";

/** One plain message per problem; empty when the file is fine on `today`. Dates are compared in UTC milliseconds. */
function securityTxtProblems(text: string, today: Date): string[] {
  const fields = new Map<string, string[]>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z-]+):\s*(.*)$/);
    if (!match) continue;
    const name = match[1].toLowerCase();
    fields.set(name, [...(fields.get(name) ?? []), match[2].trim()]);
  }

  const problems: string[] = [];
  if (!fields.has("contact")) problems.push("security.txt has no Contact: line");
  if (!fields.get("canonical")?.includes(CANONICAL)) problems.push(`security.txt has no Canonical: ${CANONICAL} line`);

  const expires = fields.get("expires")?.[0];
  if (expires === undefined) {
    problems.push("security.txt has no Expires: line");
  } else {
    const left = Date.parse(expires) - today.getTime();
    // NaN fails both comparisons, so a date that does not parse lands here too.
    if (!(left > 60 * DAY_MS && left <= 365 * DAY_MS)) {
      problems.push(`security.txt expires on ${expires}: set Expires to a date up to one year ahead`);
    }
  }
  return problems;
}

/** An expired security.txt tells researchers the contact is stale; this fails 60 days before that day. */
describe("security.txt", () => {
  const text = readFileSync(join(process.cwd(), "public/.well-known/security.txt"), "utf8");

  it("is valid today and expires more than 60 days and at most one year ahead", () => {
    expect(securityTxtProblems(text, new Date())).toEqual([]);
  });

  it("warns with what to do once Expires is 60 days away or closer", () => {
    expect(securityTxtProblems(text, new Date("2027-09-01T00:00:00Z"))).toEqual([
      "security.txt expires on 2027-10-17T00:00:00.000Z: set Expires to a date up to one year ahead",
    ]);
  });

  it("reports a missing Canonical line, a date that does not parse, and an Expires too far ahead", () => {
    const today = new Date("2026-10-25T00:00:00Z");
    const noCanonical = text.replace(/^Canonical:.*$/m, "");
    expect(securityTxtProblems(noCanonical, today)).toEqual([`security.txt has no Canonical: ${CANONICAL} line`]);
    const badDate = text.replace(/^Expires:.*$/m, "Expires: not-a-date");
    expect(securityTxtProblems(badDate, today)).toEqual([
      "security.txt expires on not-a-date: set Expires to a date up to one year ahead",
    ]);
    const crlfTooFar = text.replace(/^Expires:.*$/m, "Expires: 2028-01-01T00:00:00.000Z").replace(/\n/g, "\r\n");
    expect(securityTxtProblems(crlfTooFar, today)).toEqual([
      "security.txt expires on 2028-01-01T00:00:00.000Z: set Expires to a date up to one year ahead",
    ]);
    expect(securityTxtProblems("Expires: 2027-10-17T00:00:00.000Z", today)).toEqual([
      "security.txt has no Contact: line",
      `security.txt has no Canonical: ${CANONICAL} line`,
    ]);
  });
});
