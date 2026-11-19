import { afterEach, describe, expect, it, vi } from "vitest";

import { checkLandingAssets } from "../../scripts/landing-static.mjs";
import { landingHeaders } from "../../scripts/landing-static-headers.mjs";
import { FLIGHT, JSON_LD, landingPage, policyOf, STRICT, sha, THEME } from "./fixtures/landing-page";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("next/font/google", () => ({
  JetBrains_Mono: (opts: { variable: string }) => ({ variable: `${opts.variable}-class` }),
}));

const SCRIPT = join(__dirname, "../../scripts/landing-static.mjs");

describe("the check that reads the shipped files back", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const ship = (headers: string) => {
    dir = mkdtempSync(join(tmpdir(), "landing-check-"));
    writeFileSync(join(dir, "index.html"), landingPage());
    writeFileSync(join(dir, "_headers"), headers);
    return () => checkLandingAssets(dir);
  };

  it("passes when every inline script is allowed", () => {
    expect(ship(landingHeaders({ html: landingPage(), ...STRICT }))).not.toThrow();
  });

  it("fails when an inline script's hash is not in _headers", () => {
    const stale = landingHeaders({ html: landingPage(undefined, "self.__next_f.push([2])"), ...STRICT });
    expect(ship(stale)).toThrow(`An inline script on the landing page is not allowed by _headers: ${sha(FLIGHT)}.`);
  });

  it("fails when script-src has 'unsafe-inline'", () => {
    const loose = landingHeaders({ html: landingPage(), ...STRICT }).replace(
      "script-src 'self'",
      "script-src 'self' 'unsafe-inline'",
    );
    expect(ship(loose)).toThrow("The landing page's script-src has 'unsafe-inline'.");
  });
});

describe("landing-static as a command, after opennextjs-cloudflare build", () => {
  let root = "";
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const assets = () => join(root, ".open-next", "assets");

  const setUp = ({ html, headers }: { html?: string; headers?: string }) => {
    root = mkdtempSync(join(tmpdir(), "landing-static-"));
    mkdirSync(join(root, ".next", "server", "app"), { recursive: true });
    mkdirSync(assets(), { recursive: true });
    if (html !== undefined) writeFileSync(join(root, ".next", "server", "app", "index.html"), html);
    if (headers !== undefined) writeFileSync(join(assets(), "_headers"), headers);
  };
  // Plain node, no flags: the way `npm run landing:static` runs it.
  const run = (appUrl: string) => {
    const env = { ...process.env, NEXT_PUBLIC_APP_URL: appUrl, NEXT_PUBLIC_APP_ENV: "staging", NEXT_DIST_DIR: "" };
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: root, env });
    return { status: result.status, stderr: result.stderr.toString() };
  };

  it("copies the page to the static assets and writes _headers with every inline script's hash", () => {
    setUp({ html: landingPage("https://staging.usehourly.app") });
    expect(run("https://staging.usehourly.app").status).toBe(0);
    expect(readFileSync(join(assets(), "index.html"), "utf8")).toBe(landingPage("https://staging.usehourly.app"));
    const headers = readFileSync(join(assets(), "_headers"), "utf8");
    for (const hash of [sha(THEME), sha(JSON_LD), sha(FLIGHT)]) expect(headers).toContain(hash);
    expect(headers).toContain("X-Robots-Tag: noindex");
  });

  it("keeps the rules already in _headers and adds the / rule after them; a second run is refused", () => {
    const other = "/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n";
    setUp({ html: landingPage(), headers: other });
    expect(run("https://usehourly.app").status).toBe(0);
    const headers = readFileSync(join(assets(), "_headers"), "utf8");
    expect(headers.startsWith(other)).toBe(true);
    expect(policyOf(headers)).toContain(sha(FLIGHT));
    const again = run("https://usehourly.app");
    expect(again.status).toBe(1);
    expect(again.stderr).toContain("already has the / rule: rebuild before running again.");
  });

  it("exits non-zero with a clear message when the prerendered page is missing", () => {
    setUp({});
    const { status, stderr } = run("https://usehourly.app");
    expect(status).toBe(1);
    expect(stderr.trim()).toBe(
      `Landing page not shipped: No prerendered landing page at ${join(".next", "server", "app", "index.html")}: is / still static?`,
    );
  });

  it("exits non-zero and ships nothing when the page's origin is not NEXT_PUBLIC_APP_URL", () => {
    setUp({ html: landingPage("https://staging.usehourly.app") });
    const { status, stderr } = run("https://usehourly.app");
    expect(status).toBe(1);
    expect(stderr).toContain("built for https://staging.usehourly.app");
    expect(existsSync(join(assets(), "index.html"))).toBe(false);
    expect(existsSync(join(assets(), "_headers"))).toBe(false);
  });
});
