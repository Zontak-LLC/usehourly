import { describe, expect, it, vi } from "vitest";

import { clearRateLimit, describeWait, hitRateLimit } from "@/lib/rate-limit";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

describe("throttling guesses and sign-ups", () => {
  it("allows up to the limit, then refuses with a wait, then opens again after the window", async () => {
    const db = memoryRateLimit();
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
    const db = memoryRateLimit();
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

  it("counts every request in a simultaneous burst, so guesses cannot be sent faster than the limit", async () => {
    const db = memoryRateLimit();
    const t0 = 2_000_000;
    const results = await Promise.all(
      Array.from({ length: 80 }, () => hitRateLimit(db as never, "login:ip:203.0.113.1", 10, 900, t0)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(results.filter((r) => !r.allowed)).toHaveLength(70);
    expect(db.rows.get("login:ip:203.0.113.1")?.count).toBe(80);
  });

  it("starts exactly one fresh window when many requests arrive just after the old one ends", async () => {
    const db = memoryRateLimit([{ key: "k", count: 99, reset_at: 100 }]);
    const results = await Promise.all(Array.from({ length: 30 }, () => hitRateLimit(db as never, "k", 5, 60, 200)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(db.rows.get("k")?.reset_at).toBe(260);
  });

  it("refuses a sixth sign-up from the same address and creates no account", async () => {
    const db = memoryRateLimit();
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
