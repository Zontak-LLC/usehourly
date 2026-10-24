import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bearer, DRILL_KEY, drillArmed, HEALTH_SLOW_MS, parseDrill, sameSecret } from "@/lib/drill";
import { faultActive, forgetDrillCache } from "@/server/drill";
import { handleTrpc } from "@/server/trpc-handler";

import { memoryNonBillableDays } from "./helpers/memory-non-billable";
import { memoryRateLimit } from "./helpers/memory-rate-limit";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prismaMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ getPrisma: prismaMock }));

const { GET: drillGet, POST: drillPost } = await import("@/app/api/drill/route");
const { GET: healthGet } = await import("@/app/api/health/route");

const TOKEN = "FAKE-drill-token-0123456789abcdef0123456789abcdef";
const STAGING = "https://staging.usehourly.app";

/** app_settings, rate_limits and just enough of the entry tables for entry.list. */
function memoryDb() {
  const settings = new Map<string, string>();
  return {
    settings,
    ...memoryRateLimit(),
    ...memoryNonBillableDays(),
    appSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const value = settings.get(where.key);
        return value === undefined ? null : { value };
      }),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        settings.set(where.key, create.value);
      }),
      deleteMany: vi.fn(async ({ where }: { where: { key: string; value?: string } }) => {
        const has = settings.has(where.key) && (where.value === undefined || settings.get(where.key) === where.value);
        if (has) settings.delete(where.key);
        return { count: has ? 1 : 0 };
      }),
    },
    $queryRaw: vi.fn(async () => [{ ok: 1 }]),
    timeEntry: { findMany: vi.fn(async () => []) },
    project: { findMany: vi.fn(async () => []) },
    client: { findMany: vi.fn(async () => []) },
  };
}
type Db = ReturnType<typeof memoryDb>;

const call = (method: "GET" | "POST", body?: unknown, token: string | null = TOKEN, ip = "203.0.113.7") => {
  const req = new Request(`${STAGING}/api/drill`, {
    method,
    headers: {
      "cf-connecting-ip": ip,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return method === "GET" ? drillGet(req) : drillPost(req);
};
const start = (fault: string, minutes?: number) =>
  call("POST", { action: "start", fault, ...(minutes ? { minutes } : {}) });
const health = () => healthGet();
const entries = (db: Db) =>
  handleTrpc(
    new Request(
      `${STAGING}/api/trpc/entry.list?input=${encodeURIComponent(JSON.stringify({ from: "2026-10-19", to: "2026-10-25" }))}`,
    ),
    () => ({ session: { user: { id: "u1" }, expires: "" }, prisma: db as never }),
  );

let db: Db;
let logs: string[];
const events = () => logs.map((l) => (JSON.parse(l) as { event: string }).event);

function useStaging(token: string | undefined = TOKEN, url = STAGING) {
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", url);
  vi.stubEnv("DRILL_TOKEN", token ?? "");
}

beforeEach(() => {
  db = memoryDb();
  prismaMock.mockResolvedValue(db);
  forgetDrillCache();
  logs = [];
  vi.spyOn(console, "error").mockImplementation((line: string) => {
    logs.push(line);
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the switch can never be armed on production", () => {
  it("needs the staging build, a non-production address and a long token, all three", () => {
    const ok = { appEnv: "staging", appUrl: STAGING, token: TOKEN };
    expect(drillArmed(ok)).toBe(true);
    expect(drillArmed({ ...ok, appEnv: undefined })).toBe(false);
    expect(drillArmed({ ...ok, appEnv: "production" })).toBe(false);
    expect(drillArmed({ ...ok, appUrl: "https://usehourly.app" })).toBe(false);
    expect(drillArmed({ ...ok, appUrl: "https://www.usehourly.app/" })).toBe(false);
    expect(drillArmed({ ...ok, appUrl: undefined })).toBe(false);
    expect(drillArmed({ ...ok, token: undefined })).toBe(false);
    expect(drillArmed({ ...ok, token: "short" })).toBe(false);
  });

  it("only the staging deploy script sets the staging build marker", () => {
    const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
    for (const f of [
      "package.json",
      "scripts/ci-wrangler-config.mjs",
      ".circleci/config.yml",
      "wrangler.example.jsonc",
    ])
      expect(read(f), f).not.toContain("NEXT_PUBLIC_APP_ENV");
    expect(read("scripts/staging-deploy.mjs")).toContain('NEXT_PUBLIC_APP_ENV: "staging"');
  });

  it("on the production build the route is 404 and a saved drill breaks nothing, even with a token", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://usehourly.app");
    vi.stubEnv("DRILL_TOKEN", TOKEN);
    db.settings.set(
      DRILL_KEY,
      JSON.stringify({ fault: "health-503", started: Date.now(), until: Date.now() + 60_000 }),
    );
    expect((await call("GET")).status).toBe(404);
    expect((await start("health-503")).status).toBe(404);
    expect((await health()).status).toBe(200);
    expect((await entries(db)).status).toBe(200);
    expect(db.appSetting.findUnique).not.toHaveBeenCalled();
    expect(db.rateLimit.updateMany).not.toHaveBeenCalled();
  });

  it("on staging with no DRILL_TOKEN the route is 404 and touches nothing", async () => {
    useStaging("");
    expect((await call("GET")).status).toBe(404);
    expect((await start("health-503")).status).toBe(404);
    expect((await call("POST", { action: "stop" })).status).toBe(404);
    expect(db.settings.size).toBe(0);
    expect(db.appSetting.findUnique).not.toHaveBeenCalled();
  });
});

describe("who may start a drill", () => {
  it("refuses a wrong or missing token and writes nothing", async () => {
    useStaging();
    expect((await call("POST", { action: "start", fault: "health-503" }, "FAKE-wrong-token")).status).toBe(401);
    expect((await call("POST", { action: "start", fault: "health-503" }, null)).status).toBe(401);
    expect((await call("GET", undefined, `${TOKEN}x`)).status).toBe(401);
    expect(db.settings.size).toBe(0);
    expect(events()).toEqual(["drill_refused", "drill_refused", "drill_refused"]);
    expect(logs.join("\n")).not.toContain(TOKEN);
  });

  it("stops a connection after 20 calls in 15 minutes, right token or not", async () => {
    useStaging();
    for (let i = 0; i < 20; i++) expect((await call("GET", undefined, "FAKE-guess")).status).toBe(401);
    expect((await call("GET")).status).toBe(429);
    expect((await call("GET", undefined, TOKEN, "198.51.100.9")).status).toBe(200);
  });

  it("accepts only the listed faults and at most 15 minutes", async () => {
    useStaging();
    expect((await start("delete-everything")).status).toBe(400);
    expect((await start("health-503", 16)).status).toBe(400);
    expect((await call("POST", { action: "explode" })).status).toBe(400);
    expect(db.settings.size).toBe(0);
  });

  it("compares tokens in constant time over hashes and reads only a Bearer header", async () => {
    expect(await sameSecret(TOKEN, TOKEN)).toBe(true);
    expect(await sameSecret(TOKEN.slice(0, -1), TOKEN)).toBe(false);
    expect(await sameSecret("", TOKEN)).toBe(false);
    expect(bearer(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(bearer(`Basic ${TOKEN}`)).toBeNull();
    expect(bearer(null)).toBeNull();
  });
});

describe("a drill breaks only its own path, then undoes itself", () => {
  it("health-503: the health check fails like a dead database, entries still load, stop puts it right", async () => {
    useStaging();
    const res = await start("health-503");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ running: true, fault: "health-503" });

    const down = await health();
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ ok: false });
    expect(events()).toEqual(["drill_started", "health_check_failed"]);
    expect(logs[0]).toMatch(/"fault":"health-503","expires":"\d{4}-/);
    expect(logs[1]).toContain("drill: a planned test failure");
    expect((await entries(db)).status).toBe(200);

    expect(await (await call("GET")).json()).toMatchObject({ running: true, fault: "health-503" });
    const stopped = await call("POST", { action: "stop" });
    expect(await stopped.json()).toMatchObject({ stopped: "health-503", running: false });
    expect((await health()).status).toBe(200);
    expect(events().at(-1)).toBe("drill_stopped");
  });

  it("entry-list-500: loading entries fails and tRPC logs it, the health check stays green", async () => {
    useStaging();
    await start("entry-list-500");
    const res = await entries(db);
    expect(res.status).toBe(500);
    expect(events()).toContain("trpc_internal_error");
    expect(logs.find((l) => l.includes("trpc_internal_error"))).toContain('"path":"entry.list"');
    expect(db.timeEntry.findMany).not.toHaveBeenCalled();
    expect((await health()).status).toBe(200);
  });

  it("health-slow: the health check answers, but only after 6 seconds", async () => {
    useStaging();
    await start("health-slow");
    vi.useFakeTimers();
    let done = false;
    const pending = health().then((r) => {
      done = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(HEALTH_SLOW_MS - 100);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect((await pending).status).toBe(200);
    expect((await entries(db)).status).toBe(200);
  });

  it("expires by itself, is logged once as expired, and the path works again", async () => {
    useStaging();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    await start("health-503", 1);
    expect((await health()).status).toBe(503);
    vi.setSystemTime(new Date("2026-10-24T12:01:01Z"));
    expect((await health()).status).toBe(200);
    expect((await health()).status).toBe(200);
    forgetDrillCache();
    expect((await health()).status).toBe(200);
    expect(events().filter((e) => e === "drill_expired")).toHaveLength(1);
    expect(db.settings.has(DRILL_KEY)).toBe(false);
  });

  it("without a minutes value it runs 10 minutes", async () => {
    useStaging();
    const now = Date.now();
    await start("health-slow");
    const saved = parseDrill(db.settings.get(DRILL_KEY));
    expect(saved?.until).toBeGreaterThanOrEqual(now + 10 * 60_000);
    expect(saved?.until).toBeLessThan(now + 10 * 60_000 + 5000);
  });

  it("a damaged saved value or a failed read breaks nothing", async () => {
    useStaging();
    db.settings.set(DRILL_KEY, "{not json");
    expect((await health()).status).toBe(200);
    forgetDrillCache();
    db.appSetting.findUnique.mockRejectedValueOnce(new Error("D1 hiccup"));
    expect(await faultActive(db as never, "health-503")).toBe(false);
  });
});
