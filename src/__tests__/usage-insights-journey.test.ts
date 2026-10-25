import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { adminEmails, isAdminUser } from "@/lib/admin";
import { buildInsights, weekStart } from "@/lib/insights";
import { isUsagePage, USAGE_PAGES, usageDay, usagePageForPath } from "@/lib/usage";
import { dbStamp } from "@/server/insights-activity";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ getPrisma: prismaMock }));

const createCaller = createCallerFactory(appRouter);

describe("which pages are counted", () => {
  it("maps in-app paths to the closed list and ignores everything else", () => {
    expect(usagePageForPath("/dashboard/today")).toBe("today");
    expect(usagePageForPath("/dashboard/invoices/new")).toBe("new-invoice");
    expect(usagePageForPath("/dashboard/invoices/")).toBe("invoices"); // trailing slash
    expect(usagePageForPath("/dashboard/insights")).toBeNull(); // the admin page is never counted
    expect(usagePageForPath("/dashboard/week/../account")).toBeNull();
    expect(usagePageForPath("/")).toBeNull();
    expect(USAGE_PAGES.every(isUsagePage)).toBe(true);
    expect(isUsagePage("<script>")).toBe(false);
    expect(isUsagePage(undefined)).toBe(false);
  });

  it("files a view under the UTC calendar day", () => {
    expect(usageDay(new Date("2026-10-17T23:59:59Z"))).toBe("2026-10-17");
    expect(usageDay(new Date("2026-10-18T00:00:00Z"))).toBe("2026-10-18");
  });
});

describe("POST /api/usage", () => {
  const rows = new Map<string, number>();
  let limiter = memoryRateLimit();
  const upsert = vi.fn(
    async ({
      where,
      update,
    }: {
      where: { day_page: { day: string; page: string } };
      update: { count: { increment: number } };
    }) => {
      const key = `${where.day_page.day}|${where.day_page.page}`;
      rows.set(key, (rows.get(key) ?? 0) + update.count.increment);
    },
  );
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/usage/route");
    return POST(
      new Request("http://x/api/usage", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  };

  beforeEach(() => {
    rows.clear();
    upsert.mockClear();
    limiter = memoryRateLimit();
    prismaMock.mockResolvedValue({ rateLimit: limiter.rateLimit, usageDaily: { upsert } });
    authMock.mockResolvedValue({ user: { id: "u1" }, expires: "" });
  });

  it("counts a view with only the day and page, never who opened it", async () => {
    expect((await post({ page: "week" })).status).toBe(204);
    expect((await post({ page: "week" })).status).toBe(204);
    expect((await post({ page: "today" })).status).toBe(204);
    const day = usageDay();
    expect(rows.get(`${day}|week`)).toBe(2);
    expect(rows.get(`${day}|today`)).toBe(1);
    const stored = JSON.stringify(upsert.mock.calls);
    expect(stored).not.toContain("u1"); // no user id anywhere in what is written
  });

  it("quietly ignores signed-out visitors and sample accounts", async () => {
    authMock.mockResolvedValue(null);
    expect((await post({ page: "week" })).status).toBe(204);
    authMock.mockResolvedValue({ user: { id: "demo1", demo: true }, expires: "" });
    expect((await post({ page: "week" })).status).toBe(204);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses unknown pages, bad JSON and oversized bodies without writing", async () => {
    expect((await post({ page: "/etc/passwd" })).status).toBe(400);
    expect((await post({ page: 7 })).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
    expect((await post({ page: "week", pad: "x".repeat(500) })).status).toBe(413);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("drops views past 120 a minute from one account", async () => {
    for (let i = 0; i < 125; i++) await post({ page: "week" });
    expect(rows.get(`${usageDay()}|week`)).toBe(120);
  });
});

describe("who may see the numbers", () => {
  const verified = new Date("2026-01-01");
  it("needs the address on the list AND confirmed", () => {
    const list = adminEmails("Owner@Example.com, other@example.com ,");
    expect(list).toEqual(["owner@example.com", "other@example.com"]);
    expect(isAdminUser({ email: " OWNER@example.com", email_verified_at: verified }, list)).toBe(true);
    expect(isAdminUser({ email: "owner@example.com", email_verified_at: null }, list)).toBe(false); // someone registered it, never proved it
    expect(isAdminUser({ email: "owner@example.com", email_verified_at: verified, is_demo: true }, list)).toBe(false);
    expect(isAdminUser({ email: "stranger@example.com", email_verified_at: verified }, list)).toBe(false);
    expect(isAdminUser(null, list)).toBe(false);
    expect(isAdminUser({ email: "owner@example.com", email_verified_at: verified }, [])).toBe(false); // nothing configured
  });
});

describe("insights.overview", () => {
  const NOW = new Date("2026-10-17T12:00:00Z");
  const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
  type U = { id: string; email: string; email_verified_at: Date | null; is_demo: boolean; created_at: Date };
  const accounts: U[] = [
    { id: "admin", email: "owner@example.com", email_verified_at: day(100), is_demo: false, created_at: day(100) },
    { id: "u2", email: "u2@example.com", email_verified_at: day(40), is_demo: false, created_at: day(40) },
    { id: "u3", email: "u3@example.com", email_verified_at: null, is_demo: false, created_at: day(2) },
    { id: "demo", email: "x@demo.invalid", email_verified_at: null, is_demo: true, created_at: day(1) },
  ];
  const calls: { groupBy: number; args?: unknown[] } = { groupBy: 0 };
  const prisma = {
    authUser: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => accounts.find((a) => a.id === where.id) ?? null,
      ),
      findMany: vi.fn(async () => accounts.filter((a) => !a.is_demo)),
      count: vi.fn(async () => accounts.filter((a) => a.is_demo).length),
    },
    // One query, per account (server/insights-activity.ts); its plan is checked on real SQLite in
    // insights-query-plan-journey.test.ts. The sample account would never come back from it (is_demo = 0); it is
    // here to prove the rules leave it out anyway.
    $queryRawUnsafe: vi.fn(async (_sql: string, ...args: unknown[]) => {
      calls.groupBy++;
      calls.args = args;
      return [
        { user_id: "admin", first: day(95), created30: 10, active7: 1, active30: 1 },
        { user_id: "demo", first: dbStamp(day(1)), created30: 99, active7: 1, active30: 1 },
        {
          user_id: "u2",
          // SQLite's CURRENT_TIMESTAMP form (UTC, no zone): read as UTC, 21 hours after sign-up is within the first day (read as local time west of UTC it would not be)
          first: new Date(day(40).getTime() + 21 * 3600_000).toISOString().slice(0, 19).replace("T", " "),
          created30: BigInt(0),
          active7: 0,
          active30: 1,
        },
        { user_id: "u3", first: null, created30: 0, active7: 0, active30: 0 },
      ];
    }),
    invoice: { groupBy: vi.fn(async () => [{ user_id: "admin" }, { user_id: "demo" }]) },
    usageDaily: {
      findMany: vi.fn(async () => [
        { day: usageDay(NOW), page: "today", count: 30 },
        { day: usageDay(day(1)), page: "week", count: 5 },
        { day: usageDay(day(1)), page: "today", count: 20 },
      ]),
    },
  };
  const as = (id: string | null) =>
    createCaller({ session: id ? ({ user: { id }, expires: "" } as never) : null, prisma: prisma as never });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    calls.groupBy = 0;
    prisma.$queryRawUnsafe.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("gives the owner totals that leave sample accounts out", async () => {
    const out = await as("admin").insights.overview();
    expect(out.totals).toEqual({ users: 3, demoAccounts: 1 });
    expect(out.funnel).toEqual({ signedUp: 3, withEntry: 2, withInvoice: 1, firstEntryWithinDay: 1 });
    expect(out.active.last7).toBe(1);
    expect(out.active.last30).toBe(2);
    expect(out.active.retention).toEqual({ eligible: 2, active: 1 }); // admin and u2 are older than 4 weeks; only admin is active this week
    expect(out.entriesPerActiveUser30).toBe(5); // 10 entries / 2 active accounts; the sample account's 99 are ignored
    expect(out.signups.last7).toBe(1);
    expect(out.pages[0]).toMatchObject({ page: "today", views30: 50 });
    expect(out.daily).toHaveLength(14);
    expect(out.daily.at(-1)).toEqual({ day: usageDay(NOW), views: 30 });
    // The windows are bound as values, in the stored timestamp form, never written into the SQL.
    expect(calls.args).toEqual([dbStamp(day(30)), dbStamp(day(7)), dbStamp(day(30)), 20_000]);
  });

  it("is not found for everyone else, and reads no figures for them", async () => {
    await expect(as("u2").insights.overview()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(as("u3").insights.overview()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(as("demo").insights.overview()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(as(null).insights.overview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(calls.groupBy).toBe(0);
  });

  it("refuses the owner's address if it was never confirmed", async () => {
    accounts[0].email_verified_at = null;
    await expect(as("admin").insights.overview()).rejects.toMatchObject({ code: "NOT_FOUND" });
    accounts[0].email_verified_at = day(100);
  });
});

describe("buildInsights", () => {
  it("fills empty weeks and days with zero and starts weeks on Monday", () => {
    const now = new Date("2026-10-17T12:00:00Z"); // a Saturday
    expect(weekStart(now)).toBe("2026-10-12");
    expect(weekStart(new Date("2026-10-18T10:00:00Z"))).toBe("2026-10-12"); // Sunday belongs to the same week
    const out = buildInsights({
      now,
      users: [{ id: "a", created_at: new Date("2026-10-13T08:00:00Z") }],
      demoCount: 0,
      entryStats: [],
      active7: [],
      active30: [],
      entries30: [],
      invoiceUserIds: [],
      usage: [],
    });
    expect(out.signups.byWeek).toHaveLength(12);
    expect(out.signups.byWeek.at(-1)).toEqual({ week: "2026-10-12", count: 1 });
    expect(out.signups.byWeek.slice(0, -1).every((w) => w.count === 0)).toBe(true);
    expect(out.entriesPerActiveUser30).toBeNull();
    expect(out.funnel).toEqual({ signedUp: 1, withEntry: 0, withInvoice: 0, firstEntryWithinDay: 0 });
  });
});
