import { describe, expect, it, vi } from "vitest";

import { clearRateLimit, describeWait, hitRateLimit } from "@/lib/rate-limit";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

type Row = { key: string; count: number; reset_at: number };

/** An in-memory stand-in for the rate_limits table. */
function memoryLimits() {
  const rows = new Map<string, Row>();
  return {
    rows,
    rateLimit: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => rows.get(where.key) ?? null),
      upsert: vi.fn(
        async ({ where, create, update }: { where: { key: string }; create: Row; update: Partial<Row> }) => {
          const prev = rows.get(where.key);
          rows.set(where.key, prev ? { ...prev, ...update } : create);
        },
      ),
      update: vi.fn(async ({ where, data }: { where: { key: string }; data: Partial<Row> }) => {
        const prev = rows.get(where.key);
        if (prev) rows.set(where.key, { ...prev, ...data });
      }),
      deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
        rows.delete(where.key);
      }),
    },
  };
}

describe("throttling guesses and sign-ups", () => {
  it("allows up to the limit, then refuses with a wait, then opens again after the window", async () => {
    const db = memoryLimits();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(await hitRateLimit(db as never, "login:email:a@b.c", 3, 900, t0 + i)).toEqual({ allowed: true });
    }
    const blocked = await hitRateLimit(db as never, "login:email:a@b.c", 3, 900, t0 + 10);
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 900 - 10 });

    // a different key is unaffected
    expect(await hitRateLimit(db as never, "login:email:other@b.c", 3, 900, t0 + 10)).toEqual({ allowed: true });

    // the window passes: a fresh count starts
    expect(await hitRateLimit(db as never, "login:email:a@b.c", 3, 900, t0 + 901)).toEqual({ allowed: true });
    expect(db.rows.get("login:email:a@b.c")?.count).toBe(1);
  });

  it("clears a counter after a successful sign-in", async () => {
    const db = memoryLimits();
    await hitRateLimit(db as never, "login:email:a@b.c", 3, 900, 1000);
    await clearRateLimit(db as never, "login:email:a@b.c");
    expect(db.rows.has("login:email:a@b.c")).toBe(false);
  });

  it("says how long to wait in plain words", () => {
    expect(describeWait(20)).toBe("about a minute");
    expect(describeWait(60)).toBe("about a minute");
    expect(describeWait(61)).toBe("about 2 minutes");
    expect(describeWait(840)).toBe("about 14 minutes");
  });

  it("refuses a sixth sign-up from the same address and creates no account", async () => {
    const db = memoryLimits();
    const prisma = {
      ...db,
      authUser: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: { email: string } }) => ({ id: `u-${data.email}` })),
      },
    };
    const caller = createCallerFactory(appRouter)({ session: null, prisma: prisma as never, ip: "203.0.113.9" });
    const input = (n: number) => ({ name: "Jo", email: `jo${n}@example.com`, password: "long-enough-pw" });

    for (let n = 1; n <= 5; n++) await caller.account.register(input(n));
    expect(prisma.authUser.create).toHaveBeenCalledTimes(5);

    await expect(caller.account.register(input(6))).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: expect.stringContaining("Too many sign-ups"),
    });
    expect(prisma.authUser.create).toHaveBeenCalledTimes(5);

    // someone else on another connection is not affected
    const other = createCallerFactory(appRouter)({ session: null, prisma: prisma as never, ip: "198.51.100.4" });
    await expect(other.account.register(input(7))).resolves.toBeTruthy();
  });
});
