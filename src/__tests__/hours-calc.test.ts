import { describe, expect, it } from "vitest";

import { readLines, summarize } from "@/lib/hours-calc";
import { formatMoney } from "@/lib/money";
import { accessDecision } from "@/lib/route-access";

describe("the public hours calculator", () => {
  it("adds mixed notations, prices the total, and flags what it could not read", () => {
    const t = summarize(readLines("1:30\n2h\n\n45m\n1.25\nnonsense"), 85);
    expect(t).toMatchObject({ minutes: 330, unreadable: 1, clock: "5:30", decimal: "5.50", amountCents: 46750 });
  });

  it("shows the same amount for its starting lines at a rate of 85 (written through formatMoney)", () => {
    const t = summarize(readLines("1:30\n2h\n45m\n1.25"), 85);
    expect(t.amountCents).not.toBeNull();
    expect(formatMoney(t.amountCents ?? 0, "USD")).toBe("$467.50");
    // A rate that lands on an odd cent keeps that cent: 10 min at $10.01 = 166.83 cents, rounded once to $1.67.
    const odd = summarize(readLines("10m"), 10.01);
    expect(formatMoney(odd.amountCents ?? 0, "USD")).toBe("$1.67");
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
