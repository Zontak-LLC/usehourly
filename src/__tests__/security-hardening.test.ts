import { describe, expect, it, vi } from "vitest";

import { DUMMY_HASH, passwordMatches } from "@/lib/password";
import { QUOTAS } from "@/lib/quotas";
import { enforceRequestLimits, WRITES_PER_ANON_IP, WRITES_PER_USER } from "@/lib/request-limits";
import { MAX_BATCH } from "@/lib/trpc-limits";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { handleTrpc } from "@/server/trpc-handler";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

const createCaller = createCallerFactory(appRouter);

describe("one account cannot fill the shared database", () => {
  const asUser = (prisma: object) =>
    createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });

  it("refuses a new entry at the entry limit and writes nothing", async () => {
    const prisma = {
      project: { findFirst: vi.fn(async () => ({ id: "p1" })) },
      timeEntry: { count: vi.fn(async () => QUOTAS.entries), create: vi.fn() },
    };
    await expect(
      asUser(prisma).entry.create({ projectId: "p1", date: "2026-10-09", minutes: 30 }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("limit of 50,000 entries"),
    });
    expect(prisma.timeEntry.count).toHaveBeenCalledWith({ where: { user_id: "u1" } });
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("allows the last entry under the limit but refuses a batch that would pass it", async () => {
    const prisma = {
      project: { findFirst: vi.fn(async () => ({ id: "p1" })) },
      timeEntry: {
        // Marks the entries an invoice bills (migration 0035); answers how many it marked.
        updateMany: vi.fn(async (a?: { where?: { id?: { in?: unknown[] } } }) => ({
          count: a?.where?.id?.in?.length ?? 0,
        })),
        count: vi.fn(async () => QUOTAS.entries - 1),
        create: vi.fn(async ({ data }: { data: object }) => ({ id: "e1", ...data })),
        findMany: vi.fn(async () => []),
      },
    };
    await expect(
      asUser(prisma).entry.create({ projectId: "p1", date: "2026-10-09", minutes: 30 }),
    ).resolves.toBeTruthy();
    await expect(
      asUser(prisma).entry.createMany({ projectId: "p1", dates: ["2026-10-01", "2026-10-02"], minutes: 30 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      asUser(prisma).entry.bulkSet({
        projectId: "p1",
        cells: [
          { date: "2026-10-01", minutes: 30 },
          { date: "2026-10-02", minutes: 30 },
        ],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.timeEntry.create).toHaveBeenCalledTimes(1);
  });

  it("caps clients, projects and invoices and creates nothing past the cap", async () => {
    const prisma = {
      client: {
        findFirst: vi.fn(async () => null),
        count: vi.fn(async () => QUOTAS.clients),
        create: vi.fn(),
      },
      project: { findFirst: vi.fn(async () => null), count: vi.fn(async () => QUOTAS.projects), create: vi.fn() },
      invoice: { findFirst: vi.fn(async () => null), count: vi.fn(async () => QUOTAS.invoices), create: vi.fn() },
    };
    const c = asUser(prisma);
    await expect(c.clients.create({ name: "One more" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    prisma.client.findFirst.mockResolvedValue({ id: "c1", name: "Acme" } as never);
    await expect(c.project.create({ clientId: "c1", name: "One more" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      c.invoice.create({
        clientId: "c1",
        from: "2026-10-01",
        to: "2026-10-31",
        number: "INV-1",
        issueDate: "2026-11-01",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(prisma.project.create).not.toHaveBeenCalled();
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });
});

describe("changes are throttled per account and per connection", () => {
  it("lets an account make its allowance of changes in a minute, then asks it to slow down, even in a burst", async () => {
    const db = memoryRateLimit();
    const burst = await Promise.allSettled(
      Array.from({ length: WRITES_PER_USER.limit + 40 }, () =>
        enforceRequestLimits(db as never, { method: "POST", userId: "u1", ip: "203.0.113.1" }),
      ),
    );
    expect(burst.filter((r) => r.status === "fulfilled")).toHaveLength(WRITES_PER_USER.limit);
    const refused = burst.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(refused).toHaveLength(40);
    expect(refused[0].reason).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: expect.stringContaining("a little fast"),
    });

    // someone else, on the same connection, is not held back; reads are never counted
    await expect(
      enforceRequestLimits(db as never, { method: "POST", userId: "u2", ip: "203.0.113.1" }),
    ).resolves.toBeUndefined();
    await expect(
      enforceRequestLimits(db as never, { method: "GET", userId: "u1", ip: "203.0.113.1" }),
    ).resolves.toBeUndefined();
  });

  it("limits signed-out changes per connection, more tightly, and does nothing when it cannot tell who is calling", async () => {
    const db = memoryRateLimit();
    const results = await Promise.allSettled(
      Array.from({ length: WRITES_PER_ANON_IP.limit + 5 }, () =>
        enforceRequestLimits(db as never, { method: "POST", userId: null, ip: "198.51.100.9" }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(WRITES_PER_ANON_IP.limit);
    await expect(
      enforceRequestLimits(db as never, { method: "POST", userId: null, ip: null }),
    ).resolves.toBeUndefined();
    expect(WRITES_PER_ANON_IP.limit).toBeLessThan(WRITES_PER_USER.limit);
  });
});

describe("one request cannot carry thousands of calls", () => {
  const ctx = () => ({ session: null, prisma: {} as never });
  const call = (n: number) =>
    handleTrpc(
      new Request(
        `https://usehourly.app/api/trpc/${Array(n).fill("account.emailEnabled").join(",")}?batch=1&input=${encodeURIComponent("{}")}`,
      ),
      ctx,
    );

  it("answers a batch up to the limit and refuses a bigger one without running any of it", async () => {
    const ok = await call(MAX_BATCH);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toHaveLength(MAX_BATCH);

    const tooBig = await call(MAX_BATCH + 1);
    expect(tooBig.status).toBe(400);
    expect(JSON.stringify(await tooBig.json())).toMatch(/batch/i);
  });

  it("will not run a change sent as a plain GET or as a simple cross-site content type", async () => {
    const get = await handleTrpc(
      new Request("https://usehourly.app/api/trpc/entry.delete?input=%7B%22id%22%3A%22x%22%7D"),
      ctx,
    );
    expect(get.status).toBe(405);
    for (const type of ["text/plain", "application/x-www-form-urlencoded"]) {
      const res = await handleTrpc(
        new Request("https://usehourly.app/api/trpc/account.requestPasswordReset", {
          method: "POST",
          headers: { "content-type": type },
          body: '{"email":"a@b.co"}',
        }),
        ctx,
      );
      expect(res.status).toBe(415);
    }
  });
});

describe("signing in does not reveal which accounts exist", () => {
  it("refuses an unknown address with a real password check, taking about as long as a wrong password", async () => {
    expect(DUMMY_HASH).toMatch(/^\$2[aby]\$10\$/);
    const t0 = performance.now();
    expect(await passwordMatches("whatever-it-is", null)).toBe(false);
    expect(await passwordMatches("whatever-it-is", undefined)).toBe(false);
    // two real bcrypt checks happened, not an instant refusal
    expect(performance.now() - t0).toBeGreaterThan(20);
  });

  it("still accepts the right password and refuses a wrong one", async () => {
    const { hash } = await import("bcryptjs");
    const stored = await hash("correct horse battery", 4);
    expect(await passwordMatches("correct horse battery", stored)).toBe(true);
    expect(await passwordMatches("wrong horse battery", stored)).toBe(false);
  });
});
