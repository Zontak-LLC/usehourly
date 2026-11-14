import { describe, expect, it } from "vitest";

import { accessDecision, isStrayFormPost } from "@/lib/route-access";

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
    for (const path of ["/privacy", "/terms", "/account-deleted"]) {
      expect(accessDecision(path, false)).toBe("allow");
      expect(accessDecision(path, true)).toBe("allow");
    }
    expect(accessDecision("/privacy/extra", false)).toBe("to-login");
  });

  it("serves the app manifest to signed-out visitors so phones can add it to the home screen", () => {
    expect(accessDecision("/manifest.webmanifest", false)).toBe("allow");
    expect(accessDecision("/manifest.webmanifest", true)).toBe("allow");
  });
});

// Incident usehourly:9bef45d27c59b510. A page-level <form action={serverAction}> would post exactly this without
// JavaScript and be refused: change the rule first if one is ever added.
describe("a stray form post (multipart, no action id) is refused by the proxy", () => {
  const multipart = "multipart/form-data; boundary=----x";

  it("is a multipart POST with no next-action header", () => {
    expect(isStrayFormPost("POST", multipart, null)).toBe(true);
  });

  it("matches the content type by prefix and in any case", () => {
    expect(isStrayFormPost("POST", "multipart/form-data", null)).toBe(true);
    expect(isStrayFormPost("POST", "MULTIPART/FORM-DATA; BOUNDARY=abc", null)).toBe(true);
    expect(isStrayFormPost("post", multipart, "")).toBe(true);
  });

  it("is not a real Server Action call: multipart WITH next-action", () => {
    expect(isStrayFormPost("POST", multipart, "7f3a9c")).toBe(false);
  });

  it("is not a GET, a urlencoded or text POST, or a POST with no content type", () => {
    expect(isStrayFormPost("GET", multipart, null)).toBe(false);
    expect(isStrayFormPost("POST", "application/x-www-form-urlencoded", null)).toBe(false);
    expect(isStrayFormPost("POST", "text/plain;charset=UTF-8", null)).toBe(false);
    expect(isStrayFormPost("POST", null, null)).toBe(false);
  });
});
