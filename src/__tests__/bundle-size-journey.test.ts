import { describe, expect, it } from "vitest";

import {
  formatTable,
  groupMetafile,
  measureRoutes,
  parseClientManifest,
  renderMarkdown,
  routeOfManifestKey,
  ZOD_MARKER,
  zodInFirstLoad,
} from "../../scripts/bundle-size.mjs";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * The Worker bundle measure (scripts/bundle-size.mjs, issue 280): grouping an esbuild metafile by package or chunk,
 * the docs/bundle-size.md text, and the message when there is no build. The fixture is a tiny metafile written here.
 * Issue 425 added the browser side: first-load gzip per route from a tiny Next build written here, and the zod check.
 */
const SCRIPT = join(process.cwd(), "scripts/bundle-size.mjs");

const input = (bytesInOutput: number) => ({ bytes: bytesInOutput * 3, bytesInOutput });

const METAFILE = {
  outputs: {
    "../../.open-next/server-functions/default/handler.mjs": {
      inputs: {
        "node_modules/exceljs/dist/exceljs.js": input(300),
        "node_modules/exceljs/lib/xlsx.js": input(200),
        "node_modules/@scope/pkg/index.js": input(400),
        "node_modules/a/node_modules/b/x.js": input(150),
        "../../.next/server/chunks/123.js": input(250),
        ".next/server/chunks/456.js": input(100),
        "src/app/page.js": input(40),
        "node_modules/zeta/z.js": input(60),
        "node_modules/alpha/a.js": input(60),
      },
    },
    "../../.open-next/server-functions/default/other.mjs": {
      inputs: { "node_modules/exceljs/dist/exceljs.js": input(9999), "node_modules/ignored/i.js": input(5000) },
    },
  },
};

const GROUPS = [
  { group: "exceljs", bytes: 500 },
  { group: "@scope/pkg", bytes: 400 },
  { group: "chunks/123.js", bytes: 250 },
  { group: "b", bytes: 150 },
  { group: "chunks/456.js", bytes: 100 },
  { group: "alpha", bytes: 60 },
  { group: "zeta", bytes: 60 },
  { group: "(other)", bytes: 40 },
];

// A git hook (pre-push) sets GIT_DIR and friends for every program it starts; without dropping them the script's
// `git rev-parse` in the temp folder would read the real repository's commit instead of "unknown".
const env: NodeJS.ProcessEnv = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];

/** A page manifest as Next 16 writes it: two lines that set globalThis.__RSC_MANIFEST[<page>]. */
const manifestText = (page: string, entryJSFiles: Record<string, string[]>) =>
  `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST[${JSON.stringify(page)}] = ${JSON.stringify(
    { moduleLoading: { prefix: "" }, clientModules: {}, entryCSSFiles: {}, entryJSFiles },
  )};\n`;

// Chunk text of different sizes (repeated words gzip small, so each chunk gets its own varied text).
const CHUNKS: Record<string, string> = {
  "static/chunks/root.js": Array.from({ length: 300 }, (_, i) => `r${i * 7919}`).join(";"),
  "static/chunks/layout.js": Array.from({ length: 200 }, (_, i) => `l${i * 104729}`).join(";"),
  "static/chunks/landing.js": Array.from({ length: 100 }, (_, i) => `p${i * 1299709}`).join(";"),
  "static/chunks/privacy.js": "export const privacy = 1;",
  "static/chunks/month.js": Array.from({ length: 400 }, (_, i) => `m${i * 15485863}`).join(";"),
};
const gz = (file: string) => gzipSync(CHUNKS[file]).length;

/** A tiny `.next` folder: the root files, a landing page in a route group, /privacy, a dashboard page and /_not-found. */
function writeNextBuild(next: string, chunks: Record<string, string> = CHUNKS) {
  const app = join(next, "server/app");
  for (const [file, text] of Object.entries(chunks)) {
    mkdirSync(join(next, "static/chunks"), { recursive: true });
    writeFileSync(join(next, file), text);
  }
  writeFileSync(join(next, "build-manifest.json"), JSON.stringify({ rootMainFiles: ["static/chunks/root.js"] }));
  const pages: [string, string, Record<string, string[]>][] = [
    [
      "(main)",
      "/(main)/page",
      {
        "[project]/src/app/layout": ["static/chunks/layout.js"],
        "[project]/src/app/(main)/page": ["static/chunks/layout.js", "static/chunks/landing.js"],
      },
    ],
    [
      "privacy",
      "/privacy/page",
      {
        "[project]/src/app/layout": ["static/chunks/layout.js"],
        "[project]/src/app/privacy/page": ["static/chunks/privacy.js"],
      },
    ],
    [
      "(main)/dashboard/month",
      "/(main)/dashboard/month/page",
      {
        "[project]/src/app/layout": ["static/chunks/layout.js"],
        "[project]/src/app/(main)/dashboard/month/page": ["static/chunks/month.js"],
      },
    ],
    ["_not-found", "/_not-found/page", { "[project]/src/app/layout": ["static/chunks/layout.js"] }],
  ];
  for (const [folder, page, entries] of pages) {
    mkdirSync(join(app, folder), { recursive: true });
    writeFileSync(join(app, folder, "page_client-reference-manifest.js"), manifestText(page, entries));
  }
}

/** A worker build in <dir>/build, a docs folder and a `.next` build: everything one full run reads. */
function writeFullBuild(dir: string, chunks?: Record<string, string>) {
  const build = join(dir, "build");
  mkdirSync(build);
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(build, "handler.mjs"), "x".repeat(4096));
  writeFileSync(join(build, "handler.mjs.meta.json"), JSON.stringify(METAFILE));
  writeNextBuild(join(dir, ".next"), chunks);
  return build;
}

function run(args: string[], cwd: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: "utf8" }, (err, stdout, stderr) =>
      resolve({ code: err ? Number(err.code ?? 1) : 0, stdout, stderr }),
    );
  });
}

describe("worker bundle measure", () => {
  it("groups the handler.mjs inputs by package or chunk, largest first, ties by name", () => {
    // Same package summed, @scope kept, the LAST node_modules wins, each chunk alone, the app as (other), and the
    // other output (with bigger inputs) ignored.
    expect(groupMetafile(METAFILE)).toEqual(GROUPS);
  });

  it("returns nothing when no output is handler.mjs", () => {
    expect(groupMetafile({ outputs: { "worker.js": { inputs: { "node_modules/x/y.js": input(1) } } } })).toEqual([]);
  });

  it("writes the doc with the date, commit, totals and the rows in order", () => {
    const text = renderMarkdown({
      date: "2026-10-25",
      commit: "abc1234",
      raw: 5242880,
      gzip: 1048576,
      top: GROUPS.slice(0, 3),
      summed: 1560,
    });
    expect(text).toContain("- Date: 2026-10-25\n- Commit: abc1234\n");
    expect(text).toContain("- Raw: 5242880 bytes (5.00 MB)\n- Gzip: 1048576 bytes (1.00 MB)\n");
    expect(text).toContain(
      [
        "| # | group | bytes | MB | % |",
        "| --: | :-- | --: | --: | --: |",
        "| 1 | exceljs | 500 | 0.00 | 32.1% |",
        "| 2 | @scope/pkg | 400 | 0.00 | 25.6% |",
        "| 3 | chunks/123.js | 250 | 0.00 | 16.0% |",
      ].join("\n"),
    );
  });

  it("prints the same rows in the terminal table", () => {
    const lines = formatTable(GROUPS.slice(0, 2), 1560).split("\n");
    expect(lines.map((l) => l.split(/\s+/).filter(Boolean))).toEqual([
      ["#", "group", "bytes", "MB", "%"],
      ["1", "exceljs", "500", "0.00", "32.1%"],
      ["2", "@scope/pkg", "400", "0.00", "25.6%"],
    ]);
  });

  it("measures a build folder and writes the same numbers to docs/bundle-size.md", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-size-"));
    try {
      const build = writeFullBuild(dir);
      const gzip = gzipSync("x".repeat(4096)).length;

      const result = await run([build], dir);
      expect(result.code).toBe(0);
      const totals = `handler.mjs: 4096 bytes (0.00 MB), gzip ${gzip} bytes (0.00 MB)`;
      expect(result.stdout.split("\n")[0]).toBe(totals);
      expect(result.stdout).toContain(formatTable(GROUPS, 1560));
      const doc = readFileSync(join(dir, "docs/bundle-size.md"), "utf8");
      expect(doc).toContain(`- Raw: 4096 bytes (0.00 MB)\n- Gzip: ${gzip} bytes (0.00 MB)\n`);
      expect(doc).toContain("| 8 | (other) | 40 | 0.00 | 2.6% |");
      expect(doc).toContain("- Commit: unknown");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("asks for a build and exits 1 when there is none, writing no file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-size-"));
    try {
      const result = await run([], dir);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Run npx opennextjs-cloudflare build first");
      expect(existsSync(join(dir, "docs"))).toBe(false);

      const missing = await run([join(dir, "nowhere")], dir);
      expect(missing.code).toBe(1);
      expect(missing.stderr).toContain("Run npx opennextjs-cloudflare build first");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("first-load client JS per route (issue 425)", () => {
  it("names routes without route groups or /page", () => {
    expect(routeOfManifestKey("/(main)/page")).toBe("/");
    expect(routeOfManifestKey("/(main)/dashboard/month/page")).toBe("/dashboard/month");
    expect(routeOfManifestKey("/privacy/page")).toBe("/privacy");
  });

  it("sums the gzip of the root files and every entry chunk once per route, internal routes left out", () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-routes-"));
    try {
      writeNextBuild(dir);
      const rows = measureRoutes(dir);
      const base = gz("static/chunks/root.js") + gz("static/chunks/layout.js");
      expect(rows.map((r: { route: string; gzip: number }) => [r.route, r.gzip])).toEqual([
        ["/", base + gz("static/chunks/landing.js")], // layout.js is listed twice but counted once
        ["/dashboard/month", base + gz("static/chunks/month.js")],
        ["/privacy", base + gz("static/chunks/privacy.js")],
      ]);
      expect(rows.every((r: { gzip: number }) => r.gzip > 0)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a manifest it does not understand instead of counting zero", () => {
    expect(() => parseClientManifest("module.exports = {}")).toThrow(/no __RSC_MANIFEST/);
    expect(() => parseClientManifest(manifestText("/x/page", {}))).toThrow(/no entryJSFiles/);
    expect(parseClientManifest(manifestText("/x/page", { a: ["static/chunks/a.js"] }))).toEqual({
      route: "/x",
      files: ["static/chunks/a.js"],
    });
  });

  it("finds zod in the first load of / or /privacy, and nothing when no chunk holds the marker", () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-zod-"));
    try {
      writeNextBuild(dir, { ...CHUNKS, "static/chunks/layout.js": `var a="${ZOD_MARKER}";` });
      expect(zodInFirstLoad(dir, measureRoutes(dir))).toEqual([
        { route: "/", chunk: "static/chunks/layout.js" },
        { route: "/privacy", chunk: "static/chunks/layout.js" },
      ]);
      // zod in a dashboard page's own chunk is allowed (the check is only for the public pages).
      writeNextBuild(dir, { ...CHUNKS, "static/chunks/month.js": `var a="${ZOD_MARKER}";` });
      expect(zodInFirstLoad(dir, measureRoutes(dir))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("one run writes the Worker and the route sections, prints every route and passes the zod check", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-full-"));
    try {
      const build = writeFullBuild(dir);
      const result = await run([build], dir);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/^\/dashboard\/month\s+\d+\s+[\d.]+ KB$/m);
      expect(result.stdout).toContain("No zod in the first load of / or /privacy.");
      const doc = readFileSync(join(dir, "docs/bundle-size.md"), "utf8");
      expect(doc).toContain("# Worker bundle size");
      expect(doc).toContain("## First-load client JS per route");
      const privacy = gz("static/chunks/root.js") + gz("static/chunks/layout.js") + gz("static/chunks/privacy.js");
      expect(doc).toContain(`| /privacy | ${privacy} | ${(privacy / 1024).toFixed(1)} |`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the Before table across runs and shows the change against it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-before-"));
    try {
      const build = writeFullBuild(dir);
      expect((await run([build, "--before"], dir)).code).toBe(0);
      const month = gz("static/chunks/root.js") + gz("static/chunks/layout.js") + gz("static/chunks/month.js");
      // The next build has a smaller month page.
      writeFileSync(join(dir, ".next/static/chunks/month.js"), "m");
      const smaller = month - gz("static/chunks/month.js") + gzipSync("m").length;
      expect((await run([build], dir)).code).toBe(0);
      const doc = readFileSync(join(dir, "docs/bundle-size.md"), "utf8");
      expect(doc).toContain("### Before (commit unknown,");
      expect(doc).toContain(`| /dashboard/month | ${month} | ${(month / 1024).toFixed(1)} |`);
      expect(doc).toContain(
        `| /dashboard/month | ${smaller} | ${(smaller / 1024).toFixed(1)} | ${((smaller - month) / 1024).toFixed(1)} |`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails with a clear message when zod is in the first load of a public page", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-zodrun-"));
    try {
      const build = writeFullBuild(dir, { ...CHUNKS, "static/chunks/privacy.js": `var a="${ZOD_MARKER}";` });
      const result = await run([build], dir);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        `zod is in the first load of /privacy: static/chunks/privacy.js holds "${ZOD_MARKER}"`,
      );
      expect(result.stderr).not.toContain("first load of /:");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("asks for a build when there is no .next, and refuses a manifest it cannot read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-nonext-"));
    try {
      const build = writeFullBuild(dir);
      const elsewhere = await run([build, "--next", join(dir, "nowhere")], dir);
      expect(elsewhere.code).toBe(1);
      expect(elsewhere.stderr).toContain("build found: run npx opennextjs-cloudflare build first");

      writeFileSync(join(dir, ".next/server/app/privacy/page_client-reference-manifest.js"), "self.x = {}");
      const broken = await run([build], dir);
      expect(broken.code).toBe(1);
      expect(broken.stderr).toContain("Could not read the Next build's manifests");
      expect(existsSync(join(dir, "docs/bundle-size.md"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
