import { afterEach, describe, expect, it } from "vitest";

import { buildCsp } from "@/lib/csp";

import { assertBuiltFor, inlineScriptHashes, landingHeaders } from "../../scripts/landing-static.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(__dirname, "../../scripts/landing-static.mjs");
const THEME = "(function(){document.documentElement.classList.add('x')})();";
const FLIGHT = 'self.__next_f.push([1,"0:{}\\n"])';
const sha = (body: string) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`;

/** A small landing page: two inline scripts that run, one JSON-LD block that does not, one external script. */
const page = (origin = "https://usehourly.app") =>
  `<!DOCTYPE html><html><head><link rel="canonical" href="${origin}"/><meta property="og:url" content="${origin}/"/>` +
  `<script>${THEME}</script><script src="/_next/static/chunks/main.js" async=""></script></head>` +
  `<body><script type="application/ld+json">{"@type":"SoftwareApplication"}</script><script>${FLIGHT}</script></body></html>`;

const headerLine = (headers: string, key: string) =>
  headers.split("\n").find((l) => l.trimStart().startsWith(`${key}: `)) ?? "";
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("the landing page's _headers (issue 424)", () => {
  it("allows exactly the page's inline scripts by hash: no 'unsafe-inline', no nonce, JSON-LD and src scripts left out", () => {
    expect(inlineScriptHashes(page())).toEqual([sha(THEME), sha(FLIGHT)]);
    const headers = landingHeaders(page(), undefined);
    expect(headers.split("\n").filter((l) => !l.startsWith("#"))[0]).toBe("/");
    const csp = headerLine(headers, "Content-Security-Policy").replace(/^\s*Content-Security-Policy: /, "");
    const scripts = directive(csp, "script-src");
    expect(scripts.match(/'sha256-[A-Za-z0-9+/=]+'/g)).toEqual([sha(THEME), sha(FLIGHT)]);
    // style-src keeps its 'unsafe-inline' (as on every page); scripts never get it
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'nonce-");
    // every other directive is the shared builder's production policy
    expect(csp).toBe(buildCsp([sha(THEME), sha(FLIGHT)], true));
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("carries the five security headers every other page gets, and X-Robots-Tag only on staging", () => {
    const prod = landingHeaders(page(), undefined);
    expect(headerLine(prod, "X-Content-Type-Options")).toContain("nosniff");
    expect(headerLine(prod, "X-Frame-Options")).toContain("DENY");
    expect(headerLine(prod, "Referrer-Policy")).toContain("strict-origin-when-cross-origin");
    expect(headerLine(prod, "Permissions-Policy")).toContain("camera=(), microphone=(), geolocation=()");
    expect(headerLine(prod, "Strict-Transport-Security")).toContain("max-age=31536000; includeSubDomains");
    expect(prod).not.toContain("X-Robots-Tag");
    expect(headerLine(landingHeaders(page(), "staging"), "X-Robots-Tag")).toContain("noindex, nofollow, noarchive");
  });

  it("refuses a page built for another site, or with no address to check", () => {
    expect(() => assertBuiltFor(page(), "https://usehourly.app")).not.toThrow();
    expect(() => assertBuiltFor(page("https://staging.usehourly.app"), "https://usehourly.app")).toThrow(
      /built for https:\/\/staging\.usehourly\.app/,
    );
    expect(() => assertBuiltFor(page(), undefined)).toThrow(/NEXT_PUBLIC_APP_URL/);
    expect(() => assertBuiltFor("<html></html>", "https://usehourly.app")).toThrow(/no canonical/);
  });
});

describe("landing-static as a command, after opennextjs-cloudflare build", () => {
  let root = "";
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const run = (html: string, appUrl: string) => {
    root = mkdtempSync(join(tmpdir(), "landing-static-"));
    mkdirSync(join(root, ".next", "server", "app"), { recursive: true });
    mkdirSync(join(root, ".open-next", "assets"), { recursive: true });
    writeFileSync(join(root, ".next", "server", "app", "index.html"), html);
    const env = { ...process.env, NEXT_PUBLIC_APP_URL: appUrl, NEXT_PUBLIC_APP_ENV: "staging", NEXT_DIST_DIR: "" };
    const result = spawnSync(process.execPath, ["--experimental-strip-types", SCRIPT], { cwd: root, env });
    return { status: result.status, stderr: result.stderr.toString() };
  };

  it("copies the page to the static assets and writes _headers with every inline script's hash", () => {
    expect(run(page("https://staging.usehourly.app"), "https://staging.usehourly.app").status).toBe(0);
    const assets = join(root, ".open-next", "assets");
    expect(readFileSync(join(assets, "index.html"), "utf8")).toBe(page("https://staging.usehourly.app"));
    const headers = readFileSync(join(assets, "_headers"), "utf8");
    for (const hash of [sha(THEME), sha(FLIGHT)]) expect(headers).toContain(hash);
    expect(headers).toContain("X-Robots-Tag: noindex");
  });

  it("exits non-zero and ships nothing when the page's origin is not NEXT_PUBLIC_APP_URL", () => {
    const { status, stderr } = run(page("https://staging.usehourly.app"), "https://usehourly.app");
    expect(status).toBe(1);
    expect(stderr).toContain("built for https://staging.usehourly.app");
    expect(existsSync(join(root, ".open-next", "assets", "index.html"))).toBe(false);
    expect(existsSync(join(root, ".open-next", "assets", "_headers"))).toBe(false);
  });
});
