import { describe, expect, it } from "vitest";

import { ACCOUNT_SECTIONS, rankSections } from "@/lib/account-search";

const order = (q: string) => rankSections(q).map((s) => s.id);

/** A person types what they want; the section that holds it comes to the top. */
describe("account search", () => {
  it("keeps the usual order, with no match marks, while nothing is typed", () => {
    expect(order("")).toEqual(["account", "data", "invoices", "ai"]);
    expect(order("   ")).toEqual(["account", "data", "invoices", "ai"]);
    expect(rankSections("").some((s) => s.matches)).toBe(false);
  });

  it("brings 'Your data' to the top when its name is typed, the rest follow in their order", () => {
    expect(order("data")).toEqual(["data", "account", "invoices", "ai"]);
    expect(rankSections("data")[0].matches).toBe(true);
    expect(rankSections("data")[1].matches).toBe(false);
  });

  it("finds a section from a word inside it (start of a word is enough)", () => {
    expect(order("pass")[0]).toBe("account");
    expect(order("xero")[0]).toBe("data");
    expect(order("currenc")[0]).toBe("invoices");
    expect(order("clau")[0]).toBe("ai");
    expect(order("delete")[0]).toBe("data");
  });

  it("needs every typed word to match, in the same section", () => {
    expect(order("export csv")[0]).toBe("data");
    expect(rankSections("export password").some((s) => s.matches)).toBe(false); // no section holds both
  });

  it("a section's own name beats a keyword in another section", () => {
    // "invoices" is the title of one section and a keyword of none other; "account" is a title AND a keyword of data
    expect(order("account")[0]).toBe("account");
    expect(order("invoice")[0]).toBe("invoices");
  });

  it("ignores case and punctuation, and never drops a section", () => {
    expect(order("  DATA!! ")[0]).toBe("data");
    expect(order("zzzz")).toHaveLength(ACCOUNT_SECTIONS.length);
    expect(rankSections("zzzz").some((s) => s.matches)).toBe(false);
  });
});
