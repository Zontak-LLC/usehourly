import { describe, expect, it } from "vitest";

import { accessDecision } from "@/lib/route-access";

describe("Who can see which page", () => {
  describe("a visitor who is not signed in", () => {
    it("sees the landing page and the log-in and create-account pages", () => {
      expect(accessDecision("/", false)).toBe("allow");
      expect(accessDecision("/auth/v2/login", false)).toBe("allow");
      expect(accessDecision("/auth/v2/register", false)).toBe("allow");
    });

    it("is sent to log in from anything inside the app", () => {
      for (const path of ["/dashboard/today", "/dashboard/week", "/dashboard/invoices/new", "/dashboard"]) {
        expect(accessDecision(path, false)).toBe("to-login");
      }
    });

    it("does not treat look-alike paths as public", () => {
      // "/authors" or "/auth-secret" start with "/auth" but are not the auth pages
      expect(accessDecision("/authors", false)).toBe("to-login");
      expect(accessDecision("/auth-secret", false)).toBe("to-login");
      expect(accessDecision("/home", false)).toBe("to-login");
    });
  });

  describe("a signed-in user", () => {
    it("goes straight to their day instead of the landing or log-in pages", () => {
      expect(accessDecision("/", true)).toBe("to-dashboard");
      expect(accessDecision("/auth/v2/login", true)).toBe("to-dashboard");
      expect(accessDecision("/auth/v2/register", true)).toBe("to-dashboard");
    });

    it("can open every page in the app", () => {
      for (const path of [
        "/dashboard/today",
        "/dashboard/week",
        "/dashboard/month",
        "/dashboard/report",
        "/dashboard/invoices",
      ]) {
        expect(accessDecision(path, true)).toBe("allow");
      }
    });
  });

  it("keeps the privacy and terms pages open to everyone, signed in or not", () => {
    for (const path of ["/privacy", "/terms"]) {
      expect(accessDecision(path, false)).toBe("allow");
      expect(accessDecision(path, true)).toBe("allow");
    }
    expect(accessDecision("/privacy/extra", false)).toBe("to-login");
  });
});
