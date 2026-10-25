import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOGIN_PER_IP } from "@/lib/rate-limit";
import { WRITES_PER_USER } from "@/lib/request-limits";
import { isStressEmail, SWARM_HEADER, swarmPass } from "@/lib/swarm";
import { MAX_BATCH } from "@/lib/trpc-limits";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

/**
 * The swarm pass (lib/swarm.ts): on the staging build only, a request for a stress-test account that carries the right
 * x-swarm-token skips the per-account write limit and the login throttle, so the Performance Check can drive many
 * test accounts from one machine. Everywhere else, and for everyone else, the limits are exactly as before.
 */
const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ getPrisma: prismaMock }));

const { createContext } = await import("@/server/context");
const { loginAllowed } = await import("@/lib/login-throttle");

const TOKEN = "FAKE-swarm-token-0123456789abcdef0123456789abcdef";
const STAGING = "https://staging.usehourly.app";
const STRESS = "stress-00048@stress.invalid";
const PERSON = "pat@example.com";
const BATCH = Array.from({ length: MAX_BATCH }, (_, i) => `entry.update${i}`).join(",");
/** How many full batches the write limit lets one account send in a minute. */
const ALLOWED_BATCHES = WRITES_PER_USER.limit / MAX_BATCH;

function memoryDb(email: string) {
  return {
    ...memoryRateLimit(),
    authUser: { findUnique: vi.fn(async () => ({ token_version: 0, email })) },
  };
}
type Db = ReturnType<typeof memoryDb>;
let db: Db;

function signedInAs(email: string) {
  db = memoryDb(email);
  prismaMock.mockResolvedValue(db);
  authMock.mockResolvedValue({ user: { id: "u1", tv: 0 }, expires: "" });
}

const write = (token: string | null = TOKEN) =>
  new Request(`${STAGING}/api/trpc/${BATCH}?batch=1`, {
    method: "POST",
    headers: { "cf-connecting-ip": "203.0.113.7", ...(token ? { [SWARM_HEADER]: token } : {}) },
  });

/** Sends batches until one is refused; returns how many went through (capped well past the limit). */
async function batchesAllowed(token: string | null = TOKEN, tries = ALLOWED_BATCHES * 3) {
  for (let i = 0; i < tries; i++) {
    try {
      await createContext(write(token));
    } catch (err) {
      expect((err as { code?: string }).code).toBe("TOO_MANY_REQUESTS");
      return i;
    }
  }
  return tries;
}

function useBuild({ env = "staging", url = STAGING, token = TOKEN }: { env?: string; url?: string; token?: string }) {
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", env);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", url);
  vi.stubEnv("SWARM_TOKEN", token);
}

beforeEach(() => signedInAs(STRESS));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a stress account on staging with the right token", () => {
  it("is not held by the per-account write limit, and the limit counter is never touched", async () => {
    useBuild({});
    expect(await batchesAllowed()).toBe(ALLOWED_BATCHES * 3);
    expect(db.rateLimit.updateMany).not.toHaveBeenCalled();
    expect(db.rows.size).toBe(0);
  });

  it("signs in past the login throttle (the password is still checked by the caller)", async () => {
    useBuild({});
    const headers = new Headers({ [SWARM_HEADER]: TOKEN });
    for (let i = 0; i < LOGIN_PER_IP.limit * 2; i++)
      expect(await loginAllowed(db as never, STRESS, "203.0.113.7", headers)).toBe(true);
    expect(db.rows.size).toBe(0);
  });

  it("the same account without the header is limited exactly as before", async () => {
    useBuild({});
    expect(await batchesAllowed(null)).toBe(ALLOWED_BATCHES);
  });
});

describe("everywhere else the limits are exactly as today", () => {
  it("the production build refuses the pass, even with the right token", async () => {
    useBuild({ env: "production", url: "https://usehourly.app" });
    expect(await batchesAllowed()).toBe(ALLOWED_BATCHES);
  });

  it("a staging build that answers on the production address refuses it", async () => {
    useBuild({ url: "https://usehourly.app" });
    expect(await batchesAllowed()).toBe(ALLOWED_BATCHES);
    useBuild({ url: "https://www.usehourly.app" });
    signedInAs(STRESS);
    expect(await batchesAllowed()).toBe(ALLOWED_BATCHES);
  });

  it("no build marker (a plain build) refuses it", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", STAGING);
    vi.stubEnv("SWARM_TOKEN", TOKEN);
    expect(await batchesAllowed()).toBe(ALLOWED_BATCHES);
  });

  it("a wrong token is refused", async () => {
    useBuild({});
    expect(await batchesAllowed(`${TOKEN}x`)).toBe(ALLOWED_BATCHES);
  });

  it("a short SWARM_TOKEN on the Worker arms nothing, even when the header matches it", async () => {
    useBuild({ token: "short-token" });
    expect(await batchesAllowed("short-token")).toBe(ALLOWED_BATCHES);
  });

  it("an account that is not a stress account is not affected by the token", async () => {
    useBuild({});
    signedInAs(PERSON);
    expect(await batchesAllowed()).toBe(ALLOWED_BATCHES);
  });

  it("the login throttle still holds a real address, and a stress address without the token", async () => {
    useBuild({});
    const withToken = new Headers({ [SWARM_HEADER]: TOKEN });
    let allowed = 0;
    for (let i = 0; i < LOGIN_PER_IP.limit + 5; i++)
      if (await loginAllowed(db as never, `user${i}@example.com`, "203.0.113.77", withToken)) allowed++;
    expect(allowed).toBe(LOGIN_PER_IP.limit);

    let stressAllowed = 0;
    for (let i = 0; i < LOGIN_PER_IP.limit + 5; i++)
      if (await loginAllowed(db as never, STRESS, "198.51.100.1", new Headers())) stressAllowed++;
    expect(stressAllowed).toBeLessThan(LOGIN_PER_IP.limit + 5);
  });

  it("a stale session never gets the pass (it is signed out, and limited by connection)", async () => {
    useBuild({});
    db.authUser.findUnique.mockResolvedValue({ token_version: 5, email: STRESS });
    const ctx = await createContext(write());
    expect(ctx.session).toBeNull();
    expect(db.rateLimit.updateMany).toHaveBeenCalled();
  });
});

describe("the gate's rules", () => {
  it("only the reserved stress domain counts as a test account", () => {
    expect(isStressEmail(STRESS)).toBe(true);
    expect(isStressEmail(" Stress-00001@STRESS.invalid ")).toBe(true);
    for (const e of [
      PERSON,
      "@stress.invalid",
      "a@b@stress.invalid",
      "stress-1@stress.invalid.example.com",
      "x@notstress.invalid.com",
      null,
      undefined,
      "",
    ])
      expect(isStressEmail(e), String(e)).toBe(false);
  });

  it("needs all of: staging build, staging address, long token, stress account, matching header", async () => {
    const env = { appEnv: "staging", appUrl: STAGING, token: TOKEN };
    const h = (t?: string) => new Headers(t ? { [SWARM_HEADER]: t } : {});
    expect(await swarmPass(h(TOKEN), STRESS, env)).toBe(true);
    expect(await swarmPass(h(TOKEN), STRESS, { ...env, appEnv: "production" })).toBe(false);
    expect(await swarmPass(h(TOKEN), STRESS, { ...env, appUrl: "https://usehourly.app/" })).toBe(false);
    expect(await swarmPass(h(TOKEN), STRESS, { ...env, token: undefined })).toBe(false);
    expect(await swarmPass(h(TOKEN), PERSON, env)).toBe(false);
    expect(await swarmPass(h(), STRESS, env)).toBe(false);
    expect(await swarmPass(h(TOKEN.slice(0, -1)), STRESS, env)).toBe(false);
    expect(await swarmPass(null, STRESS, env)).toBe(false);
  });
});
