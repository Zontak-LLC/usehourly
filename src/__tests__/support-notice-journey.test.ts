import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseSupportNotice,
  SUPPORT_NOTICE_KEY,
  supportNoticeDismissKey,
  supportNoticeText,
} from "@/lib/support-notice";
import { appRouter } from "@/server/routers/_app";
import { readSupportNotice } from "@/server/support-notice";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

describe("which saved values show the notice", () => {
  it("shows it only for a switched-on notice with a sensible whole-dollar amount", () => {
    expect(parseSupportNotice(JSON.stringify({ on: true, cost: 25 }))).toEqual({ on: true, cost: 25 });
    expect(parseSupportNotice(JSON.stringify({ on: false, cost: 25 }))).toBeNull();
  });

  it.each([
    null,
    undefined,
    "",
    "not json",
    "{}",
    JSON.stringify({ on: true }),
    JSON.stringify({ on: true, cost: 0 }),
    JSON.stringify({ on: true, cost: -5 }),
    JSON.stringify({ on: true, cost: 12.5 }),
    JSON.stringify({ on: true, cost: "25" }),
    JSON.stringify({ on: true, cost: 10_001 }),
    JSON.stringify({ on: "yes", cost: 25 }),
  ])("shows nothing for %s", (raw) => {
    expect(parseSupportNotice(raw)).toBeNull();
  });

  it("says what hosting costs in plain words, and a changed amount is a new notice to dismiss", () => {
    expect(supportNoticeText(100)).toContain("about $100 a month");
    expect(supportNoticeText(1500)).toContain("$1,500");
    expect(supportNoticeDismissKey(25)).not.toBe(supportNoticeDismissKey(30));
  });
});

describe("the owner's switch", () => {
  const rows = new Map<string, string>();
  const users = [
    { id: "admin", email: "owner@example.com", email_verified_at: new Date(), is_demo: false },
    { id: "u2", email: "u2@example.com", email_verified_at: new Date(), is_demo: false },
    { id: "unconfirmed", email: "owner@example.com", email_verified_at: null, is_demo: false },
    { id: "demo", email: "owner@example.com", email_verified_at: new Date(), is_demo: true },
  ];
  const prisma = {
    authUser: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id) ?? null),
    },
    appSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const value = rows.get(where.key);
        return value === undefined ? null : { value };
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { key: string };
          create: { value: string };
          update: { value: string };
        }) => {
          rows.set(where.key, rows.has(where.key) ? update.value : create.value);
        },
      ),
    },
  };
  const as = (id: string | null) =>
    createCaller({ session: id ? ({ user: { id }, expires: "" } as never) : null, prisma: prisma as never });

  beforeEach(() => {
    rows.clear();
    prisma.appSetting.upsert.mockClear();
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is off until the owner switches it on, then everyone's layout reads it, and off again hides it", async () => {
    expect(await readSupportNotice(prisma as never)).toBeNull();
    expect(await as("admin").insights.supportNotice()).toEqual({ on: false, cost: null });

    const saved = await as("admin").insights.setSupportNotice({ on: true, cost: 40 });
    expect(saved).toEqual({ on: true, cost: 40 });
    expect(rows.get(SUPPORT_NOTICE_KEY)).toBe(JSON.stringify({ on: true, cost: 40 }));
    expect(await readSupportNotice(prisma as never)).toEqual({ on: true, cost: 40 });

    await as("admin").insights.setSupportNotice({ on: false, cost: 40 });
    expect(await readSupportNotice(prisma as never)).toBeNull();
    expect(await as("admin").insights.supportNotice()).toEqual({ on: false, cost: 40 }); // the amount is kept for next time
  });

  it("is for the owner only: everyone else gets NOT_FOUND and nothing is saved", async () => {
    for (const id of ["u2", "unconfirmed", "demo"]) {
      await expect(as(id).insights.supportNotice()).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(as(id).insights.setSupportNotice({ on: true, cost: 10 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    }
    await expect(as(null).insights.setSupportNotice({ on: true, cost: 10 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("refuses an amount that is not a whole number from 1 to 10,000, and saves nothing", async () => {
    for (const cost of [0, -1, 2.5, 10_001, Number.NaN]) {
      await expect(as("admin").insights.setSupportNotice({ on: true, cost })).rejects.toBeTruthy();
    }
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("a failing read (for example the table is not there yet during a deploy) shows no notice instead of breaking every page", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = {
      appSetting: { findUnique: vi.fn(async () => Promise.reject(new Error("no such table: app_settings"))) },
    };
    expect(await readSupportNotice(broken as never)).toBeNull();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("support_notice_read_failed"));
    spy.mockRestore();
  });

  it("a damaged saved value shows no notice and does not break the owner's switch", async () => {
    rows.set(SUPPORT_NOTICE_KEY, "{ broken");
    expect(await readSupportNotice(prisma as never)).toBeNull();
    expect(await as("admin").insights.supportNotice()).toEqual({ on: false, cost: null });
    rows.set(SUPPORT_NOTICE_KEY, JSON.stringify({ on: true, cost: 5000000 }));
    expect(await readSupportNotice(prisma as never)).toBeNull();
  });
});
