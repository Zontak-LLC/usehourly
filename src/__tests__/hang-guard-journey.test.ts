import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newApiToken } from "@/lib/api-token";
import { OPEN_MS, QUERY_MS, RETRY_MAX_ELAPSED_MS, RETRY_WAIT_MS } from "@/lib/health";
import { forgetDrillCache } from "@/server/drill";
import { handleMcpHttp } from "@/server/mcp/http";

import { memoryRateLimit } from "./helpers/memory-rate-limit";
import { settles } from "./helpers/settles";

const prismaMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ getPrisma: prismaMock }));

const { GET, HEAD } = await import("@/app/api/health/route");
const { POST } = await import("@/app/api/mcp/route");

/**
 * Incident 2026-10-25 (usehourly:check:website:mcp): D1 stalled, and /api/health and /api/mcp both gave no answer for
 * 25-169 s, so Night Watch (10 s timeout) saw nothing at all. Here the database never answers, and each route must
 * still answer within its limit: health 503, MCP 401 with no token, 503 with `retry-after` when it cannot check one.
 */

const never = () => new Promise<never>(() => undefined);
const URL_MCP = "https://usehourly.app/api/mcp";
const APP = "https://usehourly.app";

/** Runs the clock `ms` forward and says whether `p` answered by then ("settled") or not ("hung"). */
async function answersWithin<T>(p: Promise<T>, ms: number) {
  const state = settles(p, ms + 1);
  await vi.advanceTimersByTimeAsync(ms + 1);
  return state;
}

const mcpRequest = (token?: string) =>
  new Request(URL_MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "usehourly.app",
      "cf-connecting-ip": "203.0.113.9",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

const tokenRow = {
  id: "t1",
  name: "Claude Code",
  access: "read",
  token_version: 0,
  expires_at: null,
  revoked_at: null,
  last_used_at: null,
  user: { id: "u1", token_version: 0 },
};

/** A database whose every call works, unless a test swaps one for `never`. */
function workingDb() {
  return {
    ...memoryRateLimit(),
    apiToken: { findUnique: vi.fn(async () => tokenRow), update: vi.fn(async () => tokenRow) },
    appSetting: { findUnique: vi.fn(async () => null), deleteMany: vi.fn(async () => ({ count: 0 })) },
    $queryRaw: vi.fn(async () => [{ 1: 1 }]),
  };
}

let logs: string[];
const events = () => logs.map((l) => (JSON.parse(l) as { event: string }).event);
type FailedLine = { step: string; ms: number; attempt: number; timedOut: boolean; drilled: boolean };
const failedLine = () =>
  JSON.parse(logs.find((l) => l.includes('"event":"health_check_failed"')) ?? "{}") as FailedLine;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  forgetDrillCache();
  logs = [];
  vi.spyOn(console, "error").mockImplementation((line: string) => {
    logs.push(line);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  prismaMock.mockReset();
});

describe("the health check answers when the database stalls", () => {
  it("A1: opening the database never finishes: 503 { ok: false } within 2 s, GET and HEAD", async () => {
    prismaMock.mockImplementation(never);
    for (const method of [GET, HEAD]) {
      const res = method();
      expect(await answersWithin(res, 2000)).toBe("settled");
      expect((await res).status).toBe(503);
      expect((await res).headers.get("cache-control")).toBe("no-store");
      expect(await (await res).text()).toBe('{"ok":false}');
    }
    expect(events()).toContain("health_check_failed");
    expect(logs.find((l) => l.includes("health_check_failed"))).toContain("health database open");
  });

  it("A1: on staging, the drill read never finishes: 503 within 2 s", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.usehourly.app");
    vi.stubEnv("DRILL_TOKEN", "FAKE-drill-token-0123456789abcdef0123456789abcdef");
    const db = workingDb();
    db.appSetting.findUnique.mockImplementation(never);
    prismaMock.mockResolvedValue(db);
    const res = GET();
    expect(await answersWithin(res, 2000)).toBe("settled");
    expect((await res).status).toBe(503);
  });

  it("A2: SELECT 1 never finishes: 503 { ok: false } within 2 + 3 s, and a timeout is never tried again", async () => {
    const db = workingDb();
    db.$queryRaw.mockImplementation(never);
    prismaMock.mockResolvedValue(db);
    const res = GET();
    expect(await answersWithin(res, OPEN_MS + QUERY_MS)).toBe("settled");
    expect((await res).status).toBe(503);
    expect((await res).headers.get("cache-control")).toBe("no-store");
    expect(await (await res).json()).toEqual({ ok: false });
    expect(logs.find((l) => l.includes("health_check_failed"))).toContain("health queries");
    expect(prismaMock).toHaveBeenCalledTimes(1);
    expect(events()).not.toContain("health_check_retry");
    expect(failedLine()).toMatchObject({ step: "select", attempt: 1, timedOut: true, drilled: false });
  });

  it("with a working database it still answers 200 with both timings", async () => {
    prismaMock.mockResolvedValue(workingDb());
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: { selectMs: expect.any(Number) } });
  });
});

describe("the health check's one retry stays inside Night Watch's 10 s", () => {
  // The route times the whole check with performance.now(), so the fake clock drives it too.
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));

  const D1_DROP = "D1_ERROR: Network connection lost.";
  /** Runs `then` once the clock reaches `ms`: its value or its throw is the answer. */
  const later = <T>(ms: number, then: () => T) =>
    new Promise<Awaited<T>>((resolve, reject) =>
      setTimeout(async () => {
        try {
          resolve(await then());
        } catch (err) {
          reject(err);
        }
      }, ms),
    );
  const fail = () => {
    throw new Error(D1_DROP);
  };

  it("ms covers the whole check: a quick first failure, the wait and a slow second failure", async () => {
    const db = workingDb();
    db.$queryRaw.mockImplementationOnce(async () => fail()).mockImplementationOnce(() => later(800, fail));
    prismaMock.mockResolvedValue(db);
    const res = GET();
    expect(await answersWithin(res, RETRY_WAIT_MS + 800)).toBe("settled");
    expect((await res).status).toBe(503);
    const line = failedLine();
    expect(line).toMatchObject({ step: "select", attempt: 2, timedOut: false });
    expect(Number.isInteger(line.ms)).toBe(true);
    expect(line.ms).toBeGreaterThanOrEqual(RETRY_WAIT_MS + 800);
  });

  it("a slow failure (no timeout) is not tried again: 503 at once with attempt 1", async () => {
    const db = workingDb();
    db.$queryRaw.mockImplementation(() => later(1000, fail));
    prismaMock.mockImplementation(() => later(1900, () => db));
    const res = GET();
    expect(await answersWithin(res, 2900)).toBe("settled");
    expect((await res).status).toBe(503);
    expect(prismaMock).toHaveBeenCalledTimes(1);
    expect(events()).not.toContain("health_check_retry");
    const line = failedLine();
    expect(line).toMatchObject({ step: "select", attempt: 1, timedOut: false });
    expect(line.ms).toBeGreaterThanOrEqual(2900);
    expect(line.ms).toBeLessThan(10_000);
  });

  it("worst case with a retry: first try fails just under the limit, the second stalls to both limits, under 10 s", async () => {
    const worst = RETRY_MAX_ELAPSED_MS + RETRY_WAIT_MS + OPEN_MS + QUERY_MS;
    expect(worst).toBe(6750);
    const stalled = workingDb();
    stalled.$queryRaw.mockImplementation(never);
    prismaMock
      .mockImplementationOnce(() => later(RETRY_MAX_ELAPSED_MS - 1, fail))
      .mockImplementationOnce(() => later(OPEN_MS - 1, () => stalled));
    const res = GET();
    expect(await answersWithin(res, worst)).toBe("settled");
    expect((await res).status).toBe(503);
    expect(prismaMock).toHaveBeenCalledTimes(2);
    expect(failedLine()).toMatchObject({ step: "select", attempt: 2, timedOut: true });
    expect(failedLine().ms).toBeLessThanOrEqual(worst);
    expect(worst).toBeLessThan(10_000);
  });
});

describe("/api/mcp answers when the database stalls", () => {
  it("B: no token and the fail counter never finishes: 401 with www-authenticate within 3 s", async () => {
    const db = workingDb();
    db.rateLimit.updateMany.mockImplementation(never);
    const res = handleMcpHttp(mcpRequest(), db as never, APP);
    expect(await answersWithin(res, 3000)).toBe("settled");
    expect((await res).status).toBe(401);
    expect((await res).headers.get("www-authenticate")).toContain("Bearer");
    expect(events()).toContain("mcp_fail_counter_timeout");
  });

  it("C: a token whose lookup never finishes: 503 with retry-after 30 within 4 s, never let through", async () => {
    const db = workingDb();
    db.apiToken.findUnique.mockImplementation(never);
    const res = handleMcpHttp(mcpRequest(newApiToken()), db as never, APP);
    expect(await answersWithin(res, 4000)).toBe("settled");
    const answer = await res;
    expect(answer.status).toBe(503);
    expect(answer.headers.get("retry-after")).toBe("30");
    expect(answer.headers.get("www-authenticate")).toBeNull();
    expect(await answer.json()).toEqual({ error: "UseHourly can't check tokens right now. Try again in a minute." });
    expect(events()).toContain("mcp_token_lookup_timeout");
  });

  it("D: opening the database never finishes: the route answers 503 with retry-after 30 within 2 s", async () => {
    prismaMock.mockImplementation(never);
    const res = POST(mcpRequest());
    expect(await answersWithin(res, 2000)).toBe("settled");
    const answer = await res;
    expect(answer.status).toBe(503);
    expect(answer.headers.get("retry-after")).toBe("30");
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(await answer.json()).toEqual({ error: "UseHourly can't check tokens right now. Try again in a minute." });
    expect(events()).toContain("mcp_prisma_timeout");
  });

  it("E: a valid token whose last-used update never finishes: the request goes on after 2 s", async () => {
    const db = workingDb();
    db.apiToken.update.mockImplementation(never);
    const res = handleMcpHttp(mcpRequest(newApiToken()), db as never, APP);
    // the token is hashed first (real crypto), then the update starts its 2 s
    await vi.waitFor(() => expect(db.apiToken.update).toHaveBeenCalled());
    expect(await answersWithin(res, 2000)).toBe("settled");
    const answer = await res;
    expect(answer.status).toBe(200);
    const body = (await answer.json()) as { result: { tools: unknown[] } };
    expect(body.result.tools.length).toBeGreaterThan(0);
    expect(events()).toContain("mcp_last_used_update_failed");
  });
});
