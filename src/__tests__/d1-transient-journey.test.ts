import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { retryTransientD1 } from "@/lib/d1-retry";
import { logError } from "@/lib/log";

import { fakeD1 } from "./helpers/fake-d1";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Incident usehourly:c6e22d9fe8d78087: about 5 times a day one Prisma read on D1 failed once with a short-lived D1
 * error ("Network connection lost"), the adapter printed "Error in performIO: %O", and that tRPC request ended in an
 * error, because nothing retried it. This runs the REAL Prisma client and D1 adapter over the stand-in D1, through
 * getPrisma() in a request context, as createContext does for every signed-in tRPC call.
 *
 * What Prisma throws (recorded once, Prisma 7.10): a PrismaClientKnownRequestError (code P2039) with NO `cause`; the
 * D1 text is in its `message` ("... Message: `D1_ERROR: Network connection lost.`") and in
 * `meta.driverAdapterError.cause.originalMessage`.
 */

type Req = { env: { DB: unknown }; ctx: object; cf: object; canceled: boolean };
const requests = vi.hoisted(() => ({ als: null as unknown as AsyncLocalStorage<Req> }));
requests.als = new AsyncLocalStorage<Req>();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => {
    const store = requests.als.getStore();
    if (!store) throw new Error("not inside a request");
    return store;
  },
}));

// vitest can hand a same-tick dynamic import of a mocked module the real one, so import the mock first
async function loadPrisma() {
  vi.resetModules();
  await import("@opennextjs/cloudflare");
  return import("@/lib/prisma");
}

// awaited inside the run: a Prisma query is lazy and only starts when someone awaits it
const within = <T>(req: Req, fn: () => Promise<T>) => requests.als.run(req, async () => await fn());

const LOST = "D1_ERROR: Network connection lost.";

describe("a short-lived D1 error on a read (incident c6e22d9fe8d78087)", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => spy.mockRestore());

  // JSON lines only: the adapter's own "Error in performIO: %O" line goes to console.error too
  type Line = {
    event: string;
    attempt?: number;
    attempts?: number;
    message: string;
    error: { name: string; message: string };
  };
  const lines = (event: string): Line[] =>
    (spy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l))
      .filter((l) => l.event === event);

  async function signedIn() {
    const d1 = fakeD1();
    d1.db.exec(
      "INSERT INTO auth_users (id, name, email, password_hash, created_at) VALUES ('u1','A','a@x.invalid','x', 0)",
    );
    const { getPrisma } = await loadPrisma();
    const req: Req = { env: { DB: d1.DB }, ctx: {}, cf: {}, canceled: false };
    const prisma = await within(req, getPrisma);
    d1.sent.length = 0; // count only what the test sends
    const run = <T>(fn: () => Promise<T>) => within(req, fn);
    return { ...d1, prisma, run };
  }

  const userReads = (sent: { sql: string }[]) =>
    sent.filter((s) => /^\s*SELECT/i.test(s.sql) && s.sql.includes("auth_users")).length;

  it("retries a read that fails once, and the person gets their account", async () => {
    const { prisma, run, sent, failNext } = await signedIn();
    failNext(LOST, 1);
    const user = await run(() => prisma.authUser.findUnique({ where: { id: "u1" } }));
    expect(user?.email).toBe("a@x.invalid");
    expect(userReads(sent)).toBe(2);
    const retries = lines("d1_retry");
    expect(retries.length).toBe(1);
    expect(retries[0]).toMatchObject({ level: "warn", attempt: 1 });
    expect(retries[0].message).toContain("Network connection lost");
  });

  it("gives up after 2 retries, and the error line keeps the D1 text", async () => {
    const { prisma, run, sent, failNext } = await signedIn();
    failNext(LOST, 3);
    const err = await run(() => prisma.authUser.findUnique({ where: { id: "u1" } })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(userReads(sent)).toBe(3);
    expect(lines("d1_retry").map((l) => l.attempt)).toEqual([1, 2]);
    logError("trpc_internal_error", err);
    const [line] = lines("trpc_internal_error");
    // the shape recorded above: Prisma puts the D1 text in the error's own message
    expect(line.error.name).toBe("PrismaClientKnownRequestError");
    expect(line.error.message).toContain("Network connection lost");
  });

  it("never retries a write: an UPDATE through Prisma is sent once", async () => {
    const { prisma, run, sent, failNext } = await signedIn();
    failNext(LOST, 1);
    await expect(run(() => prisma.authUser.update({ where: { id: "u1" }, data: { name: "B" } }))).rejects.toThrow();
    expect(sent.filter((s) => /^\s*UPDATE/i.test(s.sql)).length).toBe(1);
    expect(lines("d1_retry").length).toBe(0);
  });

  it("never retries a write sent through run() (INSERT, UPDATE, DELETE)", async () => {
    const { DB, sent, failNext } = fakeD1();
    const wrapped = retryTransientD1(DB as unknown as D1Database);
    for (const sql of [
      "INSERT INTO auth_users (id, name, email, password_hash, created_at) VALUES ('u2','B','b@x.invalid','x', 0)",
      "UPDATE auth_users SET name = 'C' WHERE id = 'u2'",
      "DELETE FROM auth_users WHERE id = 'u2'",
    ]) {
      sent.length = 0;
      failNext(LOST, 1);
      await expect(wrapped.prepare(sql).bind().run()).rejects.toThrow("Network connection lost");
      expect(sent.length).toBe(1);
    }
  });

  it("never retries a write that reads back rows (INSERT ... RETURNING through raw())", async () => {
    const { DB, sent, failNext } = fakeD1();
    const wrapped = retryTransientD1(DB as unknown as D1Database);
    failNext(LOST, 1);
    const sql =
      "INSERT INTO auth_users (id, name, email, password_hash, created_at) VALUES ('u3','D','d@x.invalid','x', 0) RETURNING id";
    await expect(wrapped.prepare(sql).bind().raw({ columnNames: true })).rejects.toThrow("Network connection lost");
    expect(sent.length).toBe(1);
  });

  it("does not retry an error that is not short-lived", async () => {
    const { prisma, run, sent, failNext } = await signedIn();
    failNext("D1_ERROR: no such table: x", 1);
    await expect(run(() => prisma.authUser.findUnique({ where: { id: "u1" } }))).rejects.toThrow();
    expect(userReads(sent)).toBe(1);
    expect(lines("d1_retry").length).toBe(0);
  });

  // issue 410: words between "D1_ERROR:" and "internal error", so the plain "D1_ERROR: internal error" did not match
  const COMMIT_TOKEN = "D1_ERROR: Failed to get session commit token: internal error; reference = abc";

  it("retries a read that fails once with 'Failed to get session commit token' (issue 410)", async () => {
    const { prisma, run, sent, failNext } = await signedIn();
    failNext(COMMIT_TOKEN, 1);
    const user = await run(() => prisma.authUser.findUnique({ where: { id: "u1" } }));
    expect(user?.email).toBe("a@x.invalid");
    expect(userReads(sent)).toBe(2);
    const retries = lines("d1_retry");
    expect(retries.length).toBe(1);
    expect(retries[0]).toMatchObject({ level: "warn", attempt: 1 });
    expect(lines("d1_read_failed").length).toBe(0);
  });

  it("gives up after 3 tries and logs d1_read_failed with the real D1 text", async () => {
    const { prisma, run, sent, failNext } = await signedIn();
    failNext(COMMIT_TOKEN, 3);
    const err = await run(() => prisma.authUser.findUnique({ where: { id: "u1" } })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(userReads(sent)).toBe(3);
    const failed = lines("d1_read_failed");
    expect(failed.length).toBe(1);
    expect(failed[0]).toMatchObject({ level: "error", attempts: 3 });
    expect(failed[0].message).toContain("Failed to get session commit token");
  });

  it("logs d1_read_failed once for a read error that is not short-lived", async () => {
    const { prisma, run, sent, failNext } = await signedIn();
    failNext("D1_ERROR: no such table: x", 1);
    await expect(run(() => prisma.authUser.findUnique({ where: { id: "u1" } }))).rejects.toThrow();
    expect(userReads(sent)).toBe(1);
    expect(lines("d1_retry").length).toBe(0);
    const failed = lines("d1_read_failed");
    expect(failed.length).toBe(1);
    expect(failed[0]).toMatchObject({ level: "error", attempts: 1 });
    expect(failed[0].message).toContain("no such table: x");
  });

  it("cuts the logged D1 text to 300 characters", async () => {
    const { DB, failNext } = fakeD1();
    const wrapped = retryTransientD1(DB as unknown as D1Database);
    failNext(`D1_ERROR: ${"x".repeat(400)}`, 1);
    await expect(wrapped.prepare("SELECT 1").bind().raw()).rejects.toThrow();
    expect(lines("d1_read_failed")[0].message.length).toBe(300);
  });

  it("still retries the plain 'D1_ERROR: internal error'", async () => {
    const { prisma, run, sent, failNext } = await signedIn();
    failNext("D1_ERROR: internal error", 1);
    const user = await run(() => prisma.authUser.findUnique({ where: { id: "u1" } }));
    expect(user?.email).toBe("a@x.invalid");
    expect(userReads(sent)).toBe(2);
  });

  it("never retries a write that gets 'Failed to get session commit token'", async () => {
    const { prisma, run, sent, failNext } = await signedIn();
    failNext(COMMIT_TOKEN, 1);
    await expect(run(() => prisma.authUser.update({ where: { id: "u1" }, data: { name: "B" } }))).rejects.toThrow();
    expect(sent.filter((s) => /^\s*UPDATE/i.test(s.sql)).length).toBe(1);
    expect(lines("d1_retry").length).toBe(0);

    const d1 = fakeD1();
    const wrapped = retryTransientD1(d1.DB as unknown as D1Database);
    for (const sql of [
      "INSERT INTO auth_users (id, name, email, password_hash, created_at) VALUES ('u2','B','b@x.invalid','x', 0)",
      "UPDATE auth_users SET name = 'C' WHERE id = 'u2'",
      "DELETE FROM auth_users WHERE id = 'u2'",
    ]) {
      d1.sent.length = 0;
      d1.failNext(COMMIT_TOKEN, 1);
      await expect(wrapped.prepare(sql).bind().run()).rejects.toThrow("Failed to get session commit token");
      expect(d1.sent.length).toBe(1);
    }
  });

  it("wrapping reads nothing from the binding (getPrisma stays lazy)", () => {
    const touched: PropertyKey[] = [];
    const DB = new Proxy({}, { get: (_t, key) => touched.push(key) && undefined });
    expect(() => retryTransientD1(DB as D1Database)).not.toThrow();
    expect(() => retryTransientD1({} as D1Database)).not.toThrow();
    expect(touched).toEqual([]);
  });
});
