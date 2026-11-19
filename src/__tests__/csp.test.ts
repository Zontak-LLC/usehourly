import { describe, expect, it, vi } from "vitest";

import { newNonce } from "@/lib/csp";
import { buildCsp, securityHeaders } from "@/lib/security-policy.mjs";

// next.config.mjs only starts the local Cloudflare bindings for `next dev`; a test never needs them.
vi.mock("@opennextjs/cloudflare", () => ({ initOpenNextCloudflareForDev: vi.fn() }));

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
const nonce = (value: string, isProd: boolean, upgradeToHttps = isProd) =>
  buildCsp({ scriptSources: [`'nonce-${value}'`], isProd, upgradeToHttps });

// The exact production policy every page rendered per request gets: the shared builder must keep it byte for byte.
const PROD_NONCE_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'nonce-n' https://static.cloudflareinsights.com https://challenges.cloudflare.com https://accounts.google.com",
  "frame-src https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.anthropic.com https://api.openai.com https://accounts.google.com https://www.googleapis.com https://cloudflareinsights.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const FIVE_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];
const ROBOTS = { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" };

describe("content security policy", () => {
  it("keeps the per-request nonce policy exactly as it was", () => {
    expect(nonce("n", true)).toBe(PROD_NONCE_POLICY);
    // the browser tests' built copy runs on plain http, so it leaves the upgrade out (and nothing else changes)
    expect(nonce("n", true, false)).toBe(PROD_NONCE_POLICY.replace("; upgrade-insecure-requests", ""));
    // development: eval for hot reload, websockets for it, no analytics host and no upgrade
    expect(nonce("n", false)).toBe(
      PROD_NONCE_POLICY.replace(" https://static.cloudflareinsights.com", " 'unsafe-eval'")
        .replace(" https://cloudflareinsights.com", " ws: wss:")
        .replace("; upgrade-insecure-requests", ""),
    );
  });

  it("lets only scripts with this request's nonce run: no 'unsafe-inline' for scripts, in production or development", () => {
    for (const isProd of [true, false]) {
      const scripts = directive(nonce("abc123", isProd), "script-src");
      expect(scripts).toContain("'nonce-abc123'");
      expect(scripts).not.toContain("'unsafe-inline'");
      expect(scripts).not.toContain("*");
    }
    expect(directive(nonce("n", true), "script-src")).not.toContain("'unsafe-eval'");
  });

  it("takes script hashes instead of a nonce (the static landing page): only script-src differs", () => {
    const hashed = buildCsp({ scriptSources: ["'sha256-AAA='", "'sha256-BBB='"], isProd: true, upgradeToHttps: true });
    expect(directive(hashed, "script-src")).toBe(
      "script-src 'self' 'sha256-AAA=' 'sha256-BBB=' https://static.cloudflareinsights.com https://challenges.cloudflare.com https://accounts.google.com",
    );
    const others = (csp: string) => csp.split("; ").filter((d) => !d.startsWith("script-src "));
    expect(others(hashed)).toEqual(others(PROD_NONCE_POLICY));
  });

  it("makes a new unguessable nonce every time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => newNonce()));
    expect(seen.size).toBe(50);
    for (const n of seen) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("the security headers on every page the Worker answers", () => {
  it("are the five headers, plus X-Robots-Tag on staging only", () => {
    expect(securityHeaders({ isStaging: false })).toEqual(FIVE_HEADERS);
    expect(securityHeaders({ isStaging: true })).toEqual([...FIVE_HEADERS, ROBOTS]);
  });

  it("are what next.config.mjs sets for /(.*)", async () => {
    const headersFor = async (appEnv: string | undefined) => {
      vi.resetModules();
      vi.stubEnv("NEXT_PUBLIC_APP_ENV", appEnv);
      const { default: config } = await import("../../next.config.mjs");
      const rules = (await config.headers?.()) ?? [];
      return rules.find((rule) => rule.source === "/(.*)")?.headers;
    };
    expect(await headersFor(undefined)).toEqual(FIVE_HEADERS);
    expect(await headersFor("staging")).toEqual([...FIVE_HEADERS, ROBOTS]);
    vi.unstubAllEnvs();
  });
});
