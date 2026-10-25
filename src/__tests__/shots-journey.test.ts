import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGES,
  isLocalBase,
  MISSING_DIR,
  NOT_LOCAL,
  pngWidth,
  readSettings,
  shotFiles,
  shotPages,
} from "../../scripts/shots.mjs";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

/**
 * `npm run shots` (scripts/shots.mjs, issue 366): the settings checks that stop it before a browser starts, the page
 * list, the file names and the PNG width reader. The real screenshots come from e2e/shots.spec.ts.
 */
const SCRIPT = join(process.cwd(), "scripts/shots.mjs");

function run(env: Record<string, string>) {
  return new Promise<{ code: number; output: string }>((resolve) => {
    // Only PATH from this process, so no DAYSHIFT_ or E2E_ setting leaks in from the shell.
    const childEnv: NodeJS.ProcessEnv = { NODE_ENV: "test", ...env, PATH: process.env.PATH ?? "" };
    execFile(process.execPath, [SCRIPT], { env: childEnv, encoding: "utf8", timeout: 20_000 }, (err, stdout, stderr) =>
      resolve({ code: err ? Number(err.code ?? 1) : 0, output: stdout + stderr }),
    );
  });
}

/** A real, small PNG: signature, IHDR, one IDAT of blank grey rows, IEND (CRCs left at zero; only the header is read). */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  const rows = Buffer.alloc((width + 1) * height);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("npm run shots: settings checked before any browser starts", () => {
  it("without DAYSHIFT_SHOTS_DIR it says so in one sentence and exits 1", async () => {
    const { code, output } = await run({});
    expect(code).toBe(1);
    expect(output.trim()).toBe(MISSING_DIR);
    expect(MISSING_DIR).toBe("Set DAYSHIFT_SHOTS_DIR to the folder where the screenshots should go.");
  });

  it("refuses a live site in one sentence, exits 1 and makes no folder", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "shots-")), "out");
    const { code, output } = await run({ DAYSHIFT_SHOTS_DIR: dir, E2E_BASE_URL: "https://usehourly.com" });
    expect(code).toBe(1);
    expect(output.trim()).toBe(NOT_LOCAL);
    expect(NOT_LOCAL).toBe("npm run shots only runs against a local server (localhost or 127.0.0.1).");
    expect(existsSync(dir)).toBe(false);
  });

  it("names a route without a leading / and exits 1", async () => {
    const { code, output } = await run({ DAYSHIFT_SHOTS_DIR: tmpdir(), DAYSHIFT_SHOTS_PAGES: "/dashboard/week,week" });
    expect(code).toBe(1);
    expect(output.trim().split("\n")).toEqual([`The route "week" in DAYSHIFT_SHOTS_PAGES must start with /.`]);
  });

  it("accepts only localhost and 127.0.0.1", () => {
    expect(isLocalBase("http://localhost:3030")).toBe(true);
    expect(isLocalBase("http://127.0.0.1:3031")).toBe(true);
    expect(isLocalBase("https://staging.usehourly.com")).toBe(false);
    expect(isLocalBase("http://localhost.evil.test")).toBe(false);
    expect(isLocalBase("not a url")).toBe(false);
  });

  it("makes a relative folder absolute from the project folder", () => {
    const settings = readSettings({ DAYSHIFT_SHOTS_DIR: "shots-out", E2E_BASE_URL: "http://localhost:3029" }, "/work");
    expect(settings).toEqual({ dir: "/work/shots-out", pages: DEFAULT_PAGES });
    expect(readSettings({ DAYSHIFT_SHOTS_DIR: "   " }, "/work")).toEqual({ problem: MISSING_DIR });
  });
});

describe("npm run shots: the page list", () => {
  it("takes the routes given, trimmed", () => {
    expect(shotPages("/dashboard/week, /dashboard/invoices")).toEqual({
      pages: ["/dashboard/week", "/dashboard/invoices"],
    });
  });

  it("uses the default set when the list is empty", () => {
    const defaults = ["/", "/dashboard/today", "/dashboard/week", "/dashboard/invoices"];
    for (const text of [undefined, "", "   ", ",", " , ,"]) expect(shotPages(text)).toEqual({ pages: defaults });
  });

  it("uses a repeated route once", () => {
    expect(shotPages("/dashboard/week,/dashboard/week")).toEqual({ pages: ["/dashboard/week"] });
  });

  it("refuses a route without a leading / and names it", () => {
    expect(shotPages("week").problem).toBe(`The route "week" in DAYSHIFT_SHOTS_PAGES must start with /.`);
  });
});

describe("npm run shots: file names and the PNG check", () => {
  it("plans four files per page, wide first, light before dark", () => {
    expect(shotFiles("/")).toEqual([
      "home-1440-light.png",
      "home-1440-dark.png",
      "home-390-light.png",
      "home-390-dark.png",
    ]);
    expect(shotFiles("/dashboard/week?date=2026-10-22")).toEqual([
      "week-1440-light.png",
      "week-1440-dark.png",
      "week-390-light.png",
      "week-390-dark.png",
    ]);
    expect(shotFiles("/dashboard/invoices/new")[3]).toBe("invoices-new-390-dark.png");
    expect(shotFiles("/help/")[0]).toBe("help-1440-light.png");
  });

  it("reads the real width from a PNG's header", () => {
    expect(pngWidth(png(390, 2))).toBe(390);
    expect(pngWidth(png(1440, 1))).toBe(1440);
    expect(pngWidth(Buffer.from("not a png at all, just some text"))).toBeNull();
  });
});
