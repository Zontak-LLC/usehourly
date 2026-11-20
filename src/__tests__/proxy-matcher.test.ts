import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { describe, expect, it, vi } from "vitest";

import { accessDecision } from "@/lib/route-access";
import { config } from "@/proxy";

import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

// next-auth does not load under vitest (it imports "next/server" without an extension); only the matcher is tested here.
vi.mock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
vi.mock("@/lib/auth.config", () => ({ default: {} }));

const runsOn = (path: string, headers?: Record<string, string>) =>
  unstable_doesMiddlewareMatch({ config, url: `http://localhost${path}`, headers });

describe("where the proxy runs (issue 424)", () => {
  it("skips the landing page: / is a static file served before the Worker", () => {
    expect(runsOn("/")).toBe(false);
  });

  it("runs on / only for a request with a body and no action id, so the stray-form guard sees bot posts there", () => {
    expect(runsOn("/", { "content-type": "multipart/form-data; boundary=x" })).toBe(true);
    expect(runsOn("/", { "content-type": "multipart/form-data; boundary=x", "next-action": "7f3a9c" })).toBe(false);
  });

  it("still runs on every page that needs the sign-in check or a CSP nonce, unknown addresses included", () => {
    for (const path of ["/dashboard/today", "/auth/v2/login", "/help", "/privacy", "/no-such-page"]) {
      expect(runsOn(path), path).toBe(true);
    }
  });

  it("still skips the API, Next.js's own files, the metadata files and the public folders", () => {
    const staticFiles = [
      "/api/health",
      "/api/mcp",
      "/_next/static/chunks/app.js",
      "/favicon.ico",
      "/icon.svg",
      "/robots.txt",
      "/sitemap.xml",
      "/apple-icon.png",
      "/opengraph-image.png",
      "/twitter-image.png",
      "/icons/icon-192.png",
      "/landing/week-v3.webp",
      "/examples/example-invoice.pdf",
    ];
    for (const path of staticFiles) {
      expect(runsOn(path), path).toBe(false);
    }
  });

  it("runs on a page address whatever it ends with, so no page skips the sign-in check or the CSP", () => {
    const pages = [
      "/dashboard/clients/abc.png",
      "/dashboard/invoices/x.webp",
      "/help/guide.txt",
      "/no-such-page.xml",
      "/timesheet/tok.svg",
      "/invoice/tok.jpg",
      "/apiary",
      "/favicon.icox",
      "/robots.txt/x",
    ];
    for (const path of pages) {
      expect(runsOn(path), path).toBe(true);
    }
  });
});

/** Every file under `public/`, as the address it is served at. */
function publicAddresses(): string[] {
  const publicDir = join(process.cwd(), "public");
  return readdirSync(publicDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `/${relative(publicDir, join(entry.parentPath, entry.name)).split(sep).join("/")}`);
}

describe("files under public/", () => {
  it("each one skips the proxy or is open to a signed-out visitor, so none is sent to log in", () => {
    const addresses = publicAddresses();
    expect(addresses).toContain("/icons/icon-192.png");
    const sentToLogin = addresses.filter((path) => runsOn(path) && accessDecision(path, false) !== "allow");
    expect(sentToLogin).toEqual([]);
  });
});
