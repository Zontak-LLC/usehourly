import { describe, expect, it } from "vitest";

import { ACCOUNT_SECTION_LABELS, accountSectionFromHash, accountStatusLines } from "@/lib/account-sections";

/** Account as a split view (issue 283): which section an address opens, and the one line each row says. */
const fresh = { is_demo: false, email_verified_at: null, currency: "USD", business_name: null, logo: null };

describe("Account sections", () => {
  it("opens the section an address names, the old #claim as Your account, and nothing for anything else", () => {
    expect(accountSectionFromHash("#data")).toBe("data");
    expect(accountSectionFromHash("invoices")).toBe("invoices");
    expect(accountSectionFromHash("#claim")).toBe("account");
    expect(accountSectionFromHash("")).toBeNull();
    expect(accountSectionFromHash("#toString")).toBeNull();
    expect(accountSectionFromHash("#nope")).toBeNull();
    expect(ACCOUNT_SECTION_LABELS.ai).toBe("API tokens & AI");
  });

  it("a new account is told what to do next; a set-up one reads as done", () => {
    expect(accountStatusLines(fresh, undefined, undefined)).toEqual({
      account: "Confirm your email",
      invoices: "USD · no business name yet",
      data: "Export or delete",
      ai: "Connect an assistant",
    });
    const tokens = [{ state: "active" }, { state: "revoked" }, { state: "active" }];
    const clients = [{ projects: [1, 2] }, { projects: [3] }];
    const done = { ...fresh, email_verified_at: new Date(), currency: "EUR", business_name: "Sam Ltd", logo: "data:x" };
    expect(accountStatusLines(done, clients, tokens)).toEqual({
      account: "Email confirmed",
      invoices: "EUR · logo set",
      data: "2 clients · 3 projects",
      ai: "2 tokens in use",
    });
    expect(accountStatusLines({ ...done, logo: null }, [], [{ state: "expired" }])).toMatchObject({
      invoices: "EUR · no logo yet",
      data: "0 clients · 0 projects",
      ai: "No tokens yet",
    });
  });

  it("a sample account says it is not saved and that tokens need a real account", () => {
    expect(accountStatusLines({ ...fresh, is_demo: true }, [], [])).toMatchObject({
      account: "Sample account: not saved yet",
      ai: "Needs a free account",
    });
  });
});
