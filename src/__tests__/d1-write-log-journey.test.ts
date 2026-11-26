import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { retryTransientD1 } from "@/lib/d1-retry";

import { fakeD1 } from "./helpers/fake-d1";
import { logLines } from "./helpers/log-lines";
import { type Req, signedIn as signIn } from "./helpers/request-context";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Prisma's D1 adapter prints only "Error in performIO: %O" for a failed write, which says nothing in the live logs
 * (R-78). The real Prisma client and adapter run over the stand-in D1, signed in as in d1-transient-journey.test.ts.
 */

const requests = vi.hoisted(() => ({ als: null as unknown as AsyncLocalStorage<Req> }));
requests.als = new AsyncLocalStorage<Req>();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => {
    const store = requests.als.getStore();
    if (!store) throw new Error("not inside a request");
    return store;
  },
}));

const INSERT_USER =
  "INSERT INTO auth_users (id, name, email, password_hash, created_at) VALUES ('u1','A','a@x.invalid','x', 0)";
const INSERT_RETURNING =
  "INSERT INTO auth_users (id, name, email, password_hash, created_at) VALUES ('u9','Z','z@x.invalid','x', 0) RETURNING id";

describe("a failed D1 write is logged with its real message (R-78)", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => spy.mockRestore());

  const lines = (event: string) => logLines(spy, event);
  const writeLines = () => [...lines("d1_write_conflict"), ...lines("d1_write_failed")];

  const signedIn = () => signIn(requests.als);

  it("logs a unique-key clash through Prisma as d1_write_conflict (warn)", async () => {
    const { prisma, run } = await signedIn();
    const err = await run(() =>
      prisma.authUser.create({
        data: { id: "u1", name: "B", email: "b@x.invalid", password_hash: "x" },
      }),
    ).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "P2002" });
    const conflicts = lines("d1_write_conflict");
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].level).toBe("warn");
    expect(conflicts[0].message).toContain("UNIQUE constraint failed");
    expect(conflicts[0].sql?.startsWith("INSERT INTO")).toBe(true);
    expect(conflicts[0].sql?.length).toBeLessThanOrEqual(80);
    expect(lines("d1_write_failed").length).toBe(0);
  });

  it("logs any other write failure through Prisma as d1_write_failed (error), sent once", async () => {
    const { prisma, run, sent, failNext } = await signedIn();
    failNext("D1_ERROR: no such table: x", 1);
    await expect(run(() => prisma.authUser.update({ where: { id: "u1" }, data: { name: "B" } }))).rejects.toThrow();
    const failed = lines("d1_write_failed");
    expect(failed.length).toBe(1);
    expect(failed[0].level).toBe("error");
    expect(failed[0].message).toContain("no such table: x");
    expect(failed[0].sql?.startsWith("UPDATE")).toBe(true);
    expect(sent.filter((s) => /^\s*UPDATE/i.test(s.sql)).length).toBe(1);
    expect(lines("d1_retry").length).toBe(0);
    expect(lines("d1_write_conflict").length).toBe(0);
  });

  it("rethrows the very same error object from run()", async () => {
    const { DB, db } = fakeD1();
    db.exec(INSERT_USER);
    const thrown = new Error("D1_ERROR: UNIQUE constraint failed: t.id");
    const wrapped = retryTransientD1(DB as unknown as D1Database);
    const err = await wrapped
      .prepare(INSERT_USER)
      .bind()
      .run()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("UNIQUE constraint failed");
    expect(lines("d1_write_conflict").length).toBe(1);

    // the same object: capture what a real statement throws
    const failing = {
      prepare: () => ({
        bind() {
          return this;
        },
        run: () => Promise.reject(thrown),
      }),
    };
    const again = await retryTransientD1(failing as unknown as D1Database)
      .prepare("INSERT INTO t")
      .bind()
      .run()
      .catch((e: unknown) => e);
    expect(again).toBe(thrown);
  });

  it("logs a failed INSERT ... RETURNING through raw() once, sent once", async () => {
    const { DB, sent, failNext } = fakeD1();
    const wrapped = retryTransientD1(DB as unknown as D1Database);
    failNext("D1_ERROR: Network connection lost.", 1);
    await expect(wrapped.prepare(INSERT_RETURNING).bind().raw()).rejects.toThrow("Network connection lost");
    const failed = lines("d1_write_failed");
    expect(failed.length).toBe(1);
    expect(failed[0].message).toContain("Network connection lost");
    expect(sent.length).toBe(1);
  });

  it("cuts the message to 300 characters and the sql to 80", async () => {
    const { DB, failNext } = fakeD1();
    const wrapped = retryTransientD1(DB as unknown as D1Database);
    failNext(`D1_ERROR: ${"x".repeat(400)}`, 1);
    const sql = `UPDATE auth_users SET name = ? WHERE id = ? /* ${"y".repeat(200)} */`;
    await expect(wrapped.prepare(sql).bind().run()).rejects.toThrow();
    const [line] = lines("d1_write_failed");
    expect(line.message.length).toBe(300);
    expect(line.sql).toBe(sql.slice(0, 80));
  });

  it("logs nothing for a good write, and a failing read is d1_read_failed only", async () => {
    const { DB, failNext } = fakeD1();
    const wrapped = retryTransientD1(DB as unknown as D1Database);
    await wrapped.prepare(INSERT_USER).bind().run();
    expect(writeLines().length).toBe(0);
    failNext("D1_ERROR: no such table: x", 1);
    await expect(wrapped.prepare("SELECT 1").bind().raw()).rejects.toThrow();
    expect(lines("d1_read_failed").length).toBe(1);
    expect(writeLines().length).toBe(0);
  });
});
