import { afterEach, describe, expect, it } from "vitest";

import { formatTable, measureSpeed } from "../../scripts/measure-speed.mjs";
import { execFile } from "node:child_process";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

/**
 * The speed measure (scripts/measure-speed.mjs) against a local stand-in for production: a node:http server on
 * 127.0.0.1 with fixed delays per path and 200 ms extra on the first request to each. Lower bounds are strict, upper
 * bounds wide, so a slow CI machine does not make the timings flaky. Nothing leaves 127.0.0.1.
 */
const DELAYS: Record<string, number> = { "/api/health": 20, "/auth/v2/login": 80, "/": 150 };
const FIRST_EXTRA = 200;
const PATHS = ["/api/health", "/auth/v2/login", "/"];
const SCRIPT = join(process.cwd(), "scripts/measure-speed.mjs");

type Seen = { method: string; path: string; cookie: string | undefined };

const servers: { close: () => void }[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function standIn() {
  const seen: Seen[] = [];
  const count = new Map<string, number>();
  const server = createServer((req: IncomingMessage, res) => {
    const path = req.url ?? "/";
    seen.push({ method: req.method ?? "", path, cookie: req.headers.cookie });
    if (path === "/drop") {
      req.socket.destroy();
      return;
    }
    if (path === "/boom") {
      res.writeHead(500).end("boom");
      return;
    }
    const n = count.get(path) ?? 0;
    count.set(path, n + 1);
    const delay = (DELAYS[path] ?? 0) + (n === 0 ? FIRST_EXTRA : 0);
    setTimeout(() => res.writeHead(200, { "content-type": "text/plain" }).end("x".repeat(2000)), delay);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push({
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  });
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

function run(args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    // Only PATH from this process, so the child sees no cookie it was not given.
    const childEnv: NodeJS.ProcessEnv = { NODE_ENV: "test", ...env, PATH: process.env.PATH ?? "" };
    execFile(process.execPath, [SCRIPT, ...args], { env: childEnv, encoding: "utf8" }, (err, stdout, stderr) =>
      resolve({ code: err ? Number(err.code ?? 1) : 0, stdout, stderr }),
    );
  });
}

describe("measure speed", () => {
  it("times the first request and the warm median and p90 per path, in order", async () => {
    const { base, seen } = await standIn();
    const rows = await measureSpeed({ base, paths: PATHS, runs: 5, pauseMs: 0 });

    expect(rows.map((r) => r.path)).toEqual(PATHS);
    for (const r of rows) {
      const delay = DELAYS[r.path] ?? 0;
      expect(r.status).toBe(200);
      expect(r.error).toBeNull();
      expect(r.firstMs).toBeGreaterThanOrEqual(delay + FIRST_EXTRA);
      expect(r.firstMs).toBeLessThan(delay + FIRST_EXTRA + 300);
      expect(r.medianMs).toBeGreaterThanOrEqual(delay);
      expect(r.medianMs).toBeLessThan(delay + 150);
      expect(r.p90Ms).toBeGreaterThanOrEqual(delay);
      expect(r.p90Ms).toBeLessThan(delay + 150);
    }

    // Only GETs, one first request plus `runs` more per path.
    expect(new Set(seen.map((s) => s.method))).toEqual(new Set(["GET"]));
    for (const p of PATHS) expect(seen.filter((s) => s.path === p)).toHaveLength(1 + 5);

    const table = formatTable(rows);
    expect(table.split("\n")).toHaveLength(1 + PATHS.length);
    expect(table).toMatch(/^endpoint\s+status\s+first\s+median\s+p90$/m);
  });

  it("keeps a dropped connection as an error in its row", async () => {
    const { base } = await standIn();
    const [row] = await measureSpeed({ base, paths: ["/drop"], runs: 2, pauseMs: 0 });
    expect(row?.error).toBeTruthy();
    expect(row?.status).toBeNull();
    expect(formatTable(row ? [row] : [])).toMatch(/^\/drop\s+error\s+-\s+-\s+-$/m);
  });

  it("from the command line: sends the cookie from the env var, never prints it, exits 0", async () => {
    const { base, seen } = await standIn();
    const res = await run([base, "--runs=3", "--pause=0", "--cookie=TEST_COOKIE"], { TEST_COOKIE: "secret-value-123" });

    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/endpoint\s+status\s+first\s+median\s+p90/);
    expect(res.stdout).toContain("signed in (cookie from TEST_COOKIE)");
    for (const p of PATHS) expect(res.stdout).toMatch(new RegExp(`^${p.replace(/\//g, "\\/")}\\s+200\\s`, "m"));
    expect(seen).toHaveLength(PATHS.length * (1 + 3));
    expect(seen.every((s) => s.cookie === "secret-value-123" && s.method === "GET")).toBe(true);
    expect(res.stdout).not.toContain("secret-value-123");
    expect(res.stderr).not.toContain("secret-value-123");
  });

  it("stops with code 2 when the cookie variable is not set, naming the variable only", async () => {
    const res = await run(["http://127.0.0.1:9", "--pause=0", "--cookie=MISSING_VAR"]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("MISSING_VAR");
  });

  it.each(["--runs=0", "--runs=500", "--runs=2.5", "--pause=121", "--pause=-1", "--pause=x"])(
    "refuses %s with code 2 and a usage line",
    async (flag) => {
      const res = await run(["http://127.0.0.1:9", flag]);
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("Usage:");
    },
  );

  it("shows a 500 and a closed connection in their rows and exits 1", async () => {
    const { base } = await standIn();
    const res = await run([base, "--runs=1", "--pause=0", "--path=/boom", "--path=/drop"]);
    expect(res.code).toBe(1);
    expect(res.stdout).toMatch(/^\/boom\s+500\s/m);
    expect(res.stdout).toMatch(/^\/drop\s+error\s/m);
    expect(res.stdout).toMatch(/^\/api\/health\s+200\s/m);
  });
});
