import { describe, expect, it } from "vitest";

import { readLines, summarize } from "@/lib/hours-calc";
import { accessDecision } from "@/lib/route-access";

describe("the public hours calculator", () => {
  it("adds mixed notations, prices the total, and flags what it could not read", () => {
    const t = summarize(readLines("1:30\n2h\n\n45m\n1.25\nnonsense"), 85);
    expect(t).toMatchObject({ minutes: 330, unreadable: 1, clock: "5:30", decimal: "5.50", amountCents: 46750 });
  });

  it("gives no amount without a rate", () => {
    expect(summarize(readLines("1h"), null).amountCents).toBeNull();
  });

  it("is open to signed-out and signed-in visitors alike", () => {
    expect(accessDecision("/tools/hours-calculator", false)).toBe("allow");
    expect(accessDecision("/tools/hours-calculator", true)).toBe("allow");
  });

  it("serves the registry's domain-verification file without signing in", () => {
    expect(accessDecision("/.well-known/mcp-registry-auth", false)).toBe("allow");
  });
});
