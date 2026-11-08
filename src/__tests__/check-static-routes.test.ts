import { describe, expect, it } from "vitest";

import { STATIC_ALLOWED, unexpectedStaticRoutes } from "../../scripts/check-static-routes.mjs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(__dirname, "../../scripts/check-static-routes.mjs");

const manifest = (routes: string[]) => ({
  version: 4,
  routes: Object.fromEntries(routes.map((r) => [r, { routeType: "page" }])),
  dynamicRoutes: {},
});

describe("the static-route guard after next build (issue 424)", () => {
  it("passes when only / and the allowed metadata files are static", () => {
    expect(unexpectedStaticRoutes(manifest(["/", "/sitemap.xml", "/manifest.webmanifest", "/icon.svg"]))).toEqual([]);
    expect(unexpectedStaticRoutes(manifest([...STATIC_ALLOWED]))).toEqual([]);
  });

  it("names a page that became static by mistake (it would have no CSP nonce and would not hydrate)", () => {
    expect(unexpectedStaticRoutes(manifest(["/", "/sitemap.xml", "/privacy"]))).toEqual(["/privacy"]);
    expect(unexpectedStaticRoutes(manifest(["/help", "/nope", "/dashboard/today"]))).toEqual([
      "/help",
      "/nope",
      "/dashboard/today",
    ]);
  });

  it("treats a manifest with no routes as nothing static", () => {
    expect(unexpectedStaticRoutes({})).toEqual([]);
  });

  it("as a command (the end of npm run build): exits non-zero naming the page, and 0 when all is well", () => {
    const run = (routes: string[]) => {
      const distDir = mkdtempSync(join(tmpdir(), "static-routes-"));
      writeFileSync(join(distDir, "prerender-manifest.json"), JSON.stringify(manifest(routes)));
      const result = spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, NEXT_DIST_DIR: distDir } });
      rmSync(distDir, { recursive: true, force: true });
      return { status: result.status, stderr: result.stderr.toString() };
    };
    const bad = run(["/", "/sitemap.xml", "/privacy"]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("/privacy");
    expect(run(["/", "/sitemap.xml"]).status).toBe(0);
  });
});
