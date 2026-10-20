import { describe, expect, it } from "vitest";

import { buildCsp, newNonce } from "@/lib/csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("content security policy", () => {
  it("lets only scripts with this request's nonce run: no 'unsafe-inline' for scripts, in production or development", () => {
    for (const isProd of [true, false]) {
      const scripts = directive(buildCsp("abc123", isProd), "script-src");
      expect(scripts).toContain("'nonce-abc123'");
      expect(scripts).not.toContain("'unsafe-inline'");
      expect(scripts).not.toContain("*");
    }
    // eval is a development-only need (hot reload), never in production
    expect(directive(buildCsp("n", true), "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(buildCsp("n", false), "script-src")).toContain("'unsafe-eval'");
  });

  it("keeps the rest locked down: no plugins, no framing, own-origin forms and fetches, upgrade to https in production", () => {
    const prod = buildCsp("n", true);
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("base-uri 'self'");
    expect(prod).toContain("form-action 'self'");
    expect(directive(prod, "connect-src")).toBe(
      "connect-src 'self' https://api.anthropic.com https://cloudflareinsights.com",
    );
    expect(prod).toContain("upgrade-insecure-requests");
    expect(buildCsp("n", false)).not.toContain("upgrade-insecure-requests");
    // the robot check and web analytics are the only outside script hosts
    expect(directive(prod, "script-src")).toBe(
      "script-src 'self' 'nonce-n' https://static.cloudflareinsights.com https://challenges.cloudflare.com",
    );
  });

  it("makes a new unguessable nonce every time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => newNonce()));
    expect(seen.size).toBe(50);
    for (const n of seen) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
