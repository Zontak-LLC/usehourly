import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { describe, expect, it, vi } from "vitest";

import { config } from "@/proxy";

// next-auth does not load under vitest (it imports "next/server" without an extension); only the matcher is tested here.
vi.mock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
vi.mock("@/lib/auth.config", () => ({ default: {} }));

const runsOn = (path: string) => unstable_doesMiddlewareMatch({ config, url: `http://localhost${path}` });

describe("where the proxy runs (issue 424)", () => {
  it("skips the landing page: / is a static file served before the Worker", () => {
    expect(runsOn("/")).toBe(false);
  });

  it("still runs on every page that needs the sign-in check or a CSP nonce, unknown addresses included", () => {
    for (const path of ["/dashboard/today", "/auth/v2/login", "/help", "/privacy", "/nope"]) {
      expect(runsOn(path), path).toBe(true);
    }
  });

  it("still skips the API, Next.js's own files and images, as before", () => {
    for (const path of ["/api/health", "/_next/static/chunks/app.js", "/favicon.ico", "/icon.svg", "/robots.txt"]) {
      expect(runsOn(path), path).toBe(false);
    }
  });
});
