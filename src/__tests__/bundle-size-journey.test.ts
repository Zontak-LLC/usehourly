import { describe, expect, it } from "vitest";

import { formatTable, groupMetafile, renderMarkdown } from "../../scripts/bundle-size.mjs";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * The Worker bundle measure (scripts/bundle-size.mjs, issue 280): grouping an esbuild metafile by package or chunk,
 * the docs/bundle-size.md text, and the message when there is no build. The fixture is a tiny metafile written here.
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
      const build = join(dir, "build");
      mkdirSync(build);
      mkdirSync(join(dir, "docs"));
      const code = "x".repeat(4096);
      writeFileSync(join(build, "handler.mjs"), code);
      writeFileSync(join(build, "handler.mjs.meta.json"), JSON.stringify(METAFILE));
      const gzip = gzipSync(code).length;

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
