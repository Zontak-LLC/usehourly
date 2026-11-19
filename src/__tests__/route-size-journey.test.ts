import { describe, expect, it } from "vitest";

import { ROUTE_SIZE_MARKER, routeSizeSectionOf, ZOD_MARKER } from "../../scripts/bundle-size.mjs";
import { formatRoutes, routeSizes, updateDoc } from "../../scripts/route-size.mjs";
import { CHUNKS, gz, runScript, writeNextBuild } from "./helpers/next-build-fixture";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * `npm run measure:routes` (scripts/route-size.mjs, issue 425): first-load gzip per route from a plain `next build`,
 * largest first, with a zod yes/no per route, written under a marker in docs/bundle-size.md. The build is a tiny fake
 * `.next` folder written here. Nothing here reads the committed numbers in the doc, so a stale table never fails CI.
 */
const SCRIPT = join(process.cwd(), "scripts/route-size.mjs");
const BUNDLE_SCRIPT = join(process.cwd(), "scripts/bundle-size.mjs");

type Row = { route: string; gzip: number; zod: boolean };
const base = gz("static/chunks/root.js") + gz("static/chunks/layout.js");
const withZod = (file: string) => ({ ...CHUNKS, [file]: `var a="${ZOD_MARKER}";` });

function inTemp<T>(prefix: string, body: (dir: string) => Promise<T> | T) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return Promise.resolve(body(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe("route sizes", () => {
  it("sums each route's unique first-load chunks, largest first; a shared chunk counts in each route, once per route", () =>
    inTemp("route-sum-", (dir) => {
      writeNextBuild(dir);
      const rows: Row[] = routeSizes(dir);
      // layout.js is in all three routes (and listed twice for /): each route counts it, / only once.
      expect(rows.map((r) => [r.route, r.gzip])).toEqual(
        [
          ["/dashboard/month", base + gz("static/chunks/month.js")],
          ["/", base + gz("static/chunks/landing.js")],
          ["/privacy", base + gz("static/chunks/privacy.js")],
        ].sort((a, b) => Number(b[1]) - Number(a[1])),
      );
    }));

  it("says which routes load zod first: a shared chunk marks every route, a page chunk only its own", () =>
    inTemp("route-zod-", (dir) => {
      writeNextBuild(dir, withZod("static/chunks/month.js"));
      const zodOf = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.route, r.zod]));
      expect(zodOf(routeSizes(dir))).toEqual({ "/": false, "/privacy": false, "/dashboard/month": true });
      writeNextBuild(dir, withZod("static/chunks/layout.js"));
      expect(zodOf(routeSizes(dir))).toEqual({ "/": true, "/privacy": true, "/dashboard/month": true });
    }));

  it("prints route, KB gz and zod in the terminal", () => {
    const lines = formatRoutes([
      { route: "/dashboard/month", gzip: 2048, zod: true },
      { route: "/", gzip: 1024, zod: false },
    ]).split("\n");
    expect(lines.map((l) => l.split(/\s+/).filter(Boolean))).toEqual([
      ["route", "KB", "gz", "zod"],
      ["/dashboard/month", "2.0", "yes"],
      ["/", "1.0", "no"],
    ]);
  });
});

describe("the doc section under the marker", () => {
  const run = (rows: Row[], commit = "abc1234") => ({ date: "2026-11-18", commit, rows });
  const ABOVE = "# Worker bundle size\n\nhand-kept text\n";

  it("keeps everything above the marker, and each run keeps the other table", () => {
    const first = updateDoc(ABOVE, { before: true, run: run([{ route: "/", gzip: 2048, zod: true }], "base111") });
    expect(first.startsWith(`${ABOVE}\n${ROUTE_SIZE_MARKER}\n`)).toBe(true);
    expect(first).toContain("### Before (base)\n\nCommit base111, 2026-11-18.\n");
    expect(first).toContain("| / | 2.0 | yes |");
    expect(first).toContain("### After\n\nFilled by npm run measure:routes; never typed by hand.");

    const second = updateDoc(first, { before: false, run: run([{ route: "/", gzip: 1024, zod: false }], "after22") });
    expect(second.startsWith(`${ABOVE}\n${ROUTE_SIZE_MARKER}\n`)).toBe(true);
    expect(second).toContain(
      "Commit base111, 2026-11-18.\n\n| route | KB gz | zod |\n| :-- | --: | :-- |\n| / | 2.0 | yes |",
    );
    expect(second).toContain(
      "### After\n\nCommit after22, 2026-11-18.\n\n| route | KB gz | zod |\n| :-- | --: | :-- |\n| / | 1.0 | no |",
    );
    expect(second.split(ROUTE_SIZE_MARKER)).toHaveLength(2);
    // a second After run replaces only the After table
    expect(updateDoc(second, { before: false, run: run([{ route: "/", gzip: 1024, zod: false }], "after22") })).toBe(
      second,
    );
  });

  it("the script asks for a build and exits 1 when there is none, writing nothing", () =>
    inTemp("route-nobuild-", async (dir) => {
      mkdirSync(join(dir, "docs"));
      const result = await runScript(SCRIPT, [], dir);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Run next build first");
      expect(() => readFileSync(join(dir, "docs/bundle-size.md"))).toThrow();
    }));

  it("the script prints the table and writes it under the marker", () =>
    inTemp("route-run-", async (dir) => {
      mkdirSync(join(dir, "docs"));
      writeFileSync(join(dir, "docs/bundle-size.md"), ABOVE);
      writeNextBuild(join(dir, ".next"), withZod("static/chunks/month.js"));
      const result = await runScript(SCRIPT, [], dir);
      expect(result.code).toBe(0);
      const month = base + gzipSync(withZod("static/chunks/month.js")["static/chunks/month.js"]).length;
      expect(result.stdout).toMatch(new RegExp(`^/dashboard/month\\s+${(month / 1024).toFixed(1)}\\s+yes$`, "m"));
      expect(result.stdout).toContain("zod is in the first load of: /dashboard/month");
      const doc = readFileSync(join(dir, "docs/bundle-size.md"), "utf8");
      expect(doc.startsWith(`${ABOVE}\n${ROUTE_SIZE_MARKER}\n`)).toBe(true);
      expect(doc).toContain(`| /dashboard/month | ${(month / 1024).toFixed(1)} | yes |`);
    }));

  it("bundle-size.mjs rewrites its own part and keeps the marker and everything below it", () =>
    inTemp("route-keep-", async (dir) => {
      const section = `${ROUTE_SIZE_MARKER}\n## First-load JavaScript per route (next build)\n\n### After\n\n| / | 1.0 | no |\n`;
      expect(routeSizeSectionOf(`old worker text\n\n${section}`)).toBe(section);
      expect(routeSizeSectionOf("no marker here")).toBe("");

      const build = join(dir, "build");
      mkdirSync(build);
      mkdirSync(join(dir, "docs"));
      writeFileSync(join(build, "handler.mjs"), "x".repeat(4096));
      writeFileSync(join(build, "handler.mjs.meta.json"), JSON.stringify({ outputs: {} }));
      writeNextBuild(join(dir, ".next"));
      writeFileSync(join(dir, "docs/bundle-size.md"), `# Worker bundle size\n\nold numbers\n\n${section}`);
      expect((await runScript(BUNDLE_SCRIPT, [build], dir)).code).toBe(0);
      const doc = readFileSync(join(dir, "docs/bundle-size.md"), "utf8");
      expect(doc).not.toContain("old numbers");
      expect(doc).toContain("## First-load client JS per route");
      expect(doc.endsWith(`\n${section}`)).toBe(true);
    }));
});
