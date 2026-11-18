// The parser landing-static.mjs uses, imported by its path: a Next.js upgrade that drops it fails here.
import * as htmlParser from "next/dist/compiled/node-html-parser";

import { describe, expect, it, vi } from "vitest";

import { buildCsp } from "@/lib/security-policy.mjs";

import { assertBuiltFor, inlineScriptHashes, landingHeaders } from "../../scripts/landing-static-headers.mjs";
import {
  FLIGHT,
  headerLine,
  JSON_LD,
  landingPage,
  policyOf,
  STRICT,
  sha,
  THEME,
  themeTag,
} from "./fixtures/landing-page";

vi.mock("next/font/google", () => ({
  JetBrains_Mono: (opts: { variable: string }) => ({ variable: `${opts.variable}-class` }),
}));

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("the landing page's _headers rule", () => {
  it("the fixture holds the real theme boot script", () => {
    expect(themeTag.startsWith("<script>") && themeTag.endsWith("</script>")).toBe(true);
    expect(THEME).toContain('root.classList.toggle("dark"');
    expect(htmlParser.parse(landingPage()).querySelectorAll("script")).toHaveLength(4);
  });

  it("allows exactly the page's inline scripts by hash: no 'unsafe-inline', no nonce, src scripts left out", () => {
    expect(inlineScriptHashes(landingPage())).toEqual([sha(THEME), sha(JSON_LD), sha(FLIGHT)]);
    const headers = landingHeaders({ html: landingPage(), ...STRICT });
    expect(headers.split("\n").filter((line) => !line.startsWith("#"))[0]).toBe("/");
    const csp = policyOf(headers);
    const scripts = directive(csp, "script-src");
    expect(scripts.match(/'sha256-[A-Za-z0-9+/=]+'/g)).toEqual([sha(THEME), sha(JSON_LD), sha(FLIGHT)]);
    // style-src keeps its 'unsafe-inline' (as on every page); scripts never get it
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'nonce-");
    expect(csp).toBe(buildCsp({ scriptSources: [sha(THEME), sha(JSON_LD), sha(FLIGHT)], ...STRICT }));
  });

  it("changing one character of a script changes its hash", () => {
    const changed = FLIGHT.replace("hi", "ho");
    const hashes = inlineScriptHashes(landingPage(undefined, changed));
    expect(hashes).toContain(sha(changed));
    expect(hashes).not.toContain(sha(FLIGHT));
  });

  it("carries the five security headers every other page gets, and X-Robots-Tag only on staging", () => {
    const prod = landingHeaders({ html: landingPage(), ...STRICT });
    expect(headerLine(prod, "X-Content-Type-Options")).toBe("  X-Content-Type-Options: nosniff");
    expect(headerLine(prod, "X-Frame-Options")).toBe("  X-Frame-Options: DENY");
    expect(headerLine(prod, "Referrer-Policy")).toBe("  Referrer-Policy: strict-origin-when-cross-origin");
    expect(headerLine(prod, "Permissions-Policy")).toBe(
      "  Permissions-Policy: camera=(), microphone=(self), geolocation=()",
    );
    expect(headerLine(prod, "Strict-Transport-Security")).toBe(
      "  Strict-Transport-Security: max-age=31536000; includeSubDomains",
    );
    expect(prod).not.toContain("X-Robots-Tag");
    const staging = landingHeaders({ html: landingPage(), ...STRICT, isStaging: true });
    expect(headerLine(staging, "X-Robots-Tag")).toBe("  X-Robots-Tag: noindex, nofollow, noarchive");
  });

  it("refuses a page built for another site, or with no address to check", () => {
    expect(() => assertBuiltFor(landingPage(), "https://usehourly.app")).not.toThrow();
    expect(() => assertBuiltFor(landingPage("https://staging.usehourly.app"), "https://usehourly.app")).toThrow(
      "The landing page was built for https://staging.usehourly.app, not https://usehourly.app.",
    );
    expect(() => assertBuiltFor(landingPage(), undefined)).toThrow(/NEXT_PUBLIC_APP_URL/);
    expect(() => assertBuiltFor("<html></html>", "https://usehourly.app")).toThrow(/no canonical/);
  });
});
