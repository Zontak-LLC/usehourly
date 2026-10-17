import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as cronPost } from "@/app/api/cron/weekly-reminders/route";
import { GET as offGet, POST as offPost } from "@/app/api/reminders/off/route";
import type { MailMessage } from "@/lib/mailer";
import { getPrisma } from "@/lib/prisma";
import { cronToken, unsubscribeToken } from "@/lib/reminder-token";
import { runWeeklyReminders } from "@/server/reminders";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

vi.mock("@/lib/prisma", () => ({ getPrisma: vi.fn() }));

const SECRET = "test-secret";
const APP = "https://usehourly.app";
const createCaller = createCallerFactory(appRouter);

type U = {
  id: string;
  name: string | null;
  email: string;
  timezone: string | null;
  reminder_sent_week: string | null;
  weekly_reminder: boolean;
  is_demo: boolean;
  email_verified_at: Date | null;
};
type E = { user_id: string; date: string; minutes: number; project: { name: string; client: { name: string } } };

const user = (id: string, over: Partial<U> = {}): U => ({
  id,
  name: `Person ${id}`,
  email: `${id}@example.com`,
  timezone: "America/Los_Angeles",
  reminder_sent_week: null,
  weekly_reminder: true,
  is_demo: false,
  email_verified_at: new Date("2026-01-01"),
  ...over,
});

function fakeDb(users: U[], entries: E[] = []) {
  const prisma = {
    // The hourly job also sweeps old throttle counters and expired links; distinct counts show each is wired up.
    rateLimit: { deleteMany: vi.fn(async () => ({ count: 7 })) },
    emailToken: { deleteMany: vi.fn(async () => ({ count: 2 })) },
    oauthCode: { deleteMany: vi.fn(async () => ({ count: 3 })) },
    timesheetShare: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    invoiceLink: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    invoice: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) },
    authUser: {
      findMany: vi.fn(async ({ where, take }: { where: { id: { gt: string } }; take: number }) =>
        users
          .filter((u) => u.id > where.id.gt && u.weekly_reminder && !u.is_demo && u.email_verified_at && u.timezone)
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .slice(0, take)
          .map((u) => ({ ...u })),
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: {
            id: string;
            weekly_reminder?: boolean;
            OR?: { reminder_sent_week: unknown }[];
            reminder_sent_week?: string;
          };
          data: Partial<U>;
        }) => {
          const u = users.find((x) => x.id === where.id);
          if (!u) return { count: 0 };
          if (where.weekly_reminder !== undefined && u.weekly_reminder !== where.weekly_reminder) return { count: 0 };
          if (where.OR) {
            const sent = u.reminder_sent_week;
            const week = (where.OR[1].reminder_sent_week as { not: string }).not;
            if (!(sent === null || sent !== week)) return { count: 0 };
          }
          if (where.reminder_sent_week !== undefined && u.reminder_sent_week !== where.reminder_sent_week)
            return { count: 0 };
          Object.assign(u, data);
          return { count: 1 };
        },
      ),
    },
    timeEntry: {
      findMany: vi.fn(async ({ where }: { where: { user_id: string; date: { gte: string; lte: string } } }) =>
        entries.filter((e) => e.user_id === where.user_id && e.date >= where.date.gte && e.date <= where.date.lte),
      ),
    },
  };
  return prisma;
}

function mailbox(failFor: string[] = []) {
  const sent: MailMessage[] = [];
  return {
    sent,
    mailer: {
      send: vi.fn(async (m: MailMessage) => {
        if (failFor.includes(m.to)) throw new Error("the email service refused the message (500)");
        sent.push(m);
      }),
    },
  };
}

// Saturday 2026-10-17 01:30 UTC = Friday 18:30 in Los Angeles, 21:30 in New York, Saturday 10:30 in Tokyo.
const FRIDAY_EVENING = new Date("2026-10-17T01:30:00Z");

describe("the hourly run that sends the Friday reminders", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined); // failures are expected in some tests
  });
  afterEach(() => vi.restoreAllMocks());

  it("emails exactly the people who are due, each with their own week", async () => {
    const users = [
      user("a-la"),
      user("b-ny", { timezone: "America/New_York" }),
      user("c-tokyo", { timezone: "Asia/Tokyo" }), // it is already Saturday there
      user("d-unconfirmed", { email_verified_at: null }),
      user("e-off", { weekly_reminder: false }),
      user("f-demo", { is_demo: true }),
      user("g-no-zone", { timezone: null }),
    ];
    const entries: E[] = [
      { user_id: "a-la", date: "2026-10-12", minutes: 120, project: { name: "Alpha site", client: { name: "Acme" } } },
      { user_id: "b-ny", date: "2026-10-13", minutes: 90, project: { name: "Beta app", client: { name: "Globex" } } },
    ];
    const db = fakeDb(users, entries);
    const box = mailbox();
    const run = await runWeeklyReminders({
      prisma: db as never,
      mailer: box.mailer,
      now: FRIDAY_EVENING,
      appUrl: APP,
      secret: SECRET,
    });

    expect(run).toEqual({ considered: 3, due: 2, sent: 2, failed: 0 });
    expect(box.sent.map((m) => m.to)).toEqual(["a-la@example.com", "b-ny@example.com"]);
    // each email carries only that person's own time
    expect(box.sent[0].text).toContain("Alpha site".length ? "2 h" : "");
    expect(box.sent[0].text).not.toContain("1.5 h");
    expect(box.sent[1].text).toContain("1.5 h");
    expect(users.find((u) => u.id === "a-la")?.reminder_sent_week).toBe("2026-W42");
    expect(users.find((u) => u.id === "c-tokyo")?.reminder_sent_week).toBeNull();
    // the unsubscribe link in each email is signed for that person
    const token = await unsubscribeToken(SECRET, "a-la");
    expect(box.sent[0].text).toContain(`${APP}/reminders/off?u=a-la&t=${encodeURIComponent(token)}`);
    expect(box.sent[0].headers?.["List-Unsubscribe"]).toContain(`${APP}/api/reminders/off?u=a-la&t=`);
  });

  it("sends once a week: not again in the next hours, and again the following Friday", async () => {
    const users = [user("a-la")];
    const db = fakeDb(users);
    const box = mailbox();
    const go = (now: Date) =>
      runWeeklyReminders({ prisma: db as never, mailer: box.mailer, now, appUrl: APP, secret: SECRET });
    expect((await go(FRIDAY_EVENING)).sent).toBe(1);
    expect((await go(new Date("2026-10-17T02:30:00Z"))).sent).toBe(0); // an hour later, still Friday 7:30 pm
    expect((await go(new Date("2026-10-17T05:30:00Z"))).sent).toBe(0);
    expect((await go(new Date("2026-10-24T01:30:00Z"))).sent).toBe(1); // next Friday evening
    expect(box.sent).toHaveLength(2);
  });

  it("cannot double-send when two runs overlap", async () => {
    const users = [user("a-la"), user("b-la")];
    const db = fakeDb(users);
    const box = mailbox();
    const go = () =>
      runWeeklyReminders({ prisma: db as never, mailer: box.mailer, now: FRIDAY_EVENING, appUrl: APP, secret: SECRET });
    const [r1, r2] = await Promise.all([go(), go()]);
    expect(r1.sent + r2.sent).toBe(2);
    expect(box.sent.map((m) => m.to).sort()).toEqual(["a-la@example.com", "b-la@example.com"]);
  });

  it("undoes the claim when the email service fails, so the next hour tries again, and one failure does not stop the rest", async () => {
    const users = [user("a-la"), user("b-la")];
    const db = fakeDb(users);
    const down = mailbox(["a-la@example.com"]);
    const first = await runWeeklyReminders({
      prisma: db as never,
      mailer: down.mailer,
      now: FRIDAY_EVENING,
      appUrl: APP,
      secret: SECRET,
    });
    expect(first).toMatchObject({ sent: 1, failed: 1 });
    expect(users.find((u) => u.id === "a-la")?.reminder_sent_week).toBeNull();
    expect(users.find((u) => u.id === "b-la")?.reminder_sent_week).toBe("2026-W42");

    const up = mailbox();
    const retry = await runWeeklyReminders({
      prisma: db as never,
      mailer: up.mailer,
      now: new Date("2026-10-17T02:30:00Z"),
      appUrl: APP,
      secret: SECRET,
    });
    expect(retry).toMatchObject({ sent: 1, failed: 0 });
    expect(up.sent.map((m) => m.to)).toEqual(["a-la@example.com"]);
  });

  it("skips a time zone it cannot read instead of crashing the run", async () => {
    const users = [user("a-bad", { timezone: "Not/AZone" }), user("b-la")];
    const box = mailbox();
    const run = await runWeeklyReminders({
      prisma: fakeDb(users) as never,
      mailer: box.mailer,
      now: FRIDAY_EVENING,
      appUrl: APP,
      secret: SECRET,
    });
    expect(run).toMatchObject({ considered: 2, sent: 1 });
  });

  it("works through a long list in pages", async () => {
    const users = Array.from({ length: 450 }, (_, i) => user(`u${String(i).padStart(4, "0")}`));
    const box = mailbox();
    const run = await runWeeklyReminders({
      prisma: fakeDb(users) as never,
      mailer: box.mailer,
      now: FRIDAY_EVENING,
      appUrl: APP,
      secret: SECRET,
    });
    expect(run).toMatchObject({ considered: 450, sent: 450 });
    expect(new Set(box.sent.map((m) => m.to)).size).toBe(450);
  });
});

describe("the cron route and the unsubscribe link", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
    process.env.NEXT_PUBLIC_APP_URL = APP;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FRIDAY_EVENING);
  });
  afterEach(() => {
    process.env = { ...env };
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const call = async (token?: string) =>
    cronPost(
      new Request(`${APP}/api/cron/weekly-reminders`, {
        method: "POST",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );

  it("refuses anyone without the key, and says plainly when email isn't set up", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("guess")).status).toBe(401);
    const db = fakeDb([]);
    vi.mocked(getPrisma).mockResolvedValue(db as never);
    const ok = await call(await cronToken(SECRET));
    // No email service, so nothing is sent, but the housekeeping sweep still runs.
    expect(await ok.json()).toEqual({
      skipped: expect.stringContaining("Email is not set up"),
      housekeeping: { rateLimits: 7, emailTokens: 2, oauthCodes: 3, timesheetShares: 1, invoiceLinks: 1 },
    });
    const now = Math.floor(Date.now() / 1000);
    expect(db.rateLimit.deleteMany).toHaveBeenCalledWith({ where: { reset_at: { lt: now - 3600 } } });
    expect(db.emailToken.deleteMany).toHaveBeenCalledWith({ where: { expires_at: { lt: now - 7 * 86400 } } });
    expect(db.oauthCode.deleteMany).toHaveBeenCalledWith({ where: { expires_at: { lt: now - 86400 } } });
    // A request without the key never reaches the database.
    expect(vi.mocked(db.rateLimit.deleteMany).mock.calls).toHaveLength(1);
  });

  it("sends through the email service with the one-click unsubscribe header when it is set up", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "UseHourly <hello@usehourly.app>";
    const users = [user("a-la")];
    vi.mocked(getPrisma).mockResolvedValue(fakeDb(users) as never);
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call(await cronToken(SECRET));
    expect(await res.json()).toEqual({
      considered: 1,
      due: 1,
      sent: 1,
      failed: 0,
      invoiceReminders: { considered: 0, sent: 0, skipped: 0, retry: 0 },
      housekeeping: { rateLimits: 7, emailTokens: 2, oauthCodes: 3, timesheetShares: 1, invoiceLinks: 1 },
    });
    const payload = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(payload).toMatchObject({ to: "a-la@example.com", from: "UseHourly <hello@usehourly.app>" });
    expect(payload.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("turns the reminder off only with a valid signed link, and only on POST", async () => {
    const users = [user("a-la")];
    vi.mocked(getPrisma).mockResolvedValue(fakeDb(users) as never);
    const good = await unsubscribeToken(SECRET, "a-la");
    const off = (u: string, t: string, init: RequestInit = { method: "POST" }) =>
      offPost(new Request(`${APP}/api/reminders/off?u=${u}&t=${encodeURIComponent(t)}`, init));

    expect((await off("a-la", "forged")).status).toBe(400);
    expect((await off("someone-else", good)).status).toBe(400); // a token is for one person only
    expect(users[0].weekly_reminder).toBe(true);
    expect((await offGet()).status).toBe(405); // a mail scanner opening the link changes nothing

    const oneClick = await off("a-la", good, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(oneClick.status).toBe(200);
    expect(users[0].weekly_reminder).toBe(false);

    users[0].weekly_reminder = true;
    const form = new FormData();
    form.set("page", "1");
    const fromPage = await off("a-la", good, { method: "POST", body: form });
    expect(fromPage.status).toBe(303);
    expect(fromPage.headers.get("location")).toContain("/reminders/off?done=1");
    expect(users[0].weekly_reminder).toBe(false);
  });
});

describe("turning the reminder on in Account", () => {
  const asUser = (db: object, mailer: object | null = { send: vi.fn() }) =>
    createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: db as never, mailer: mailer as never });
  const accountDb = (over: Record<string, unknown> = {}) => {
    const row = { is_demo: false, email_verified_at: new Date("2026-01-01"), timezone: null, ...over };
    return { authUser: { findUnique: vi.fn(async () => row), update: vi.fn(async () => ({})) } };
  };
  afterEach(() => vi.useRealTimers());

  it("needs the email service and a confirmed address, and refuses demo accounts and unknown time zones, saving nothing", async () => {
    const db = accountDb();
    await expect(asUser(db, null).account.setWeeklyReminder({ enabled: true, timezone: "UTC" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await expect(
      asUser(accountDb({ email_verified_at: null })).account.setWeeklyReminder({ enabled: true, timezone: "UTC" }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("confirm your email"),
    });
    await expect(
      asUser(accountDb({ is_demo: true })).account.setWeeklyReminder({ enabled: true, timezone: "UTC" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      asUser(db).account.setWeeklyReminder({ enabled: true, timezone: "Nope/Nowhere" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(asUser(db).account.setWeeklyReminder({ enabled: true })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    }); // no zone known
    expect(db.authUser.update).not.toHaveBeenCalled();
  });

  it("starts with this Friday if it is still ahead, and with next Friday if this week's time has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const db = accountDb();
    vi.setSystemTime(new Date("2026-10-14T15:00:00Z")); // Wednesday
    await asUser(db).account.setWeeklyReminder({ enabled: true, timezone: "America/New_York" });
    expect(db.authUser.update).toHaveBeenLastCalledWith({
      where: { id: "u1" },
      data: { weekly_reminder: true, timezone: "America/New_York", reminder_sent_week: null },
    });
    vi.setSystemTime(new Date("2026-10-17T01:30:00Z")); // Friday 9:30 pm in New York
    await asUser(db).account.setWeeklyReminder({ enabled: true, timezone: "America/New_York" });
    expect(db.authUser.update).toHaveBeenLastCalledWith({
      where: { id: "u1" },
      data: { weekly_reminder: true, timezone: "America/New_York", reminder_sent_week: "2026-W42" },
    });
  });

  it("can always be turned off, even when email is not set up", async () => {
    const db = accountDb({ email_verified_at: null });
    await expect(asUser(db, null).account.setWeeklyReminder({ enabled: false })).resolves.toEqual({ enabled: false });
    expect(db.authUser.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { weekly_reminder: false } });
  });

  it("is for signed-in accounts only", async () => {
    const db = accountDb();
    const out = createCaller({ session: null, prisma: db as never });
    await expect(out.account.setWeeklyReminder({ enabled: false })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
