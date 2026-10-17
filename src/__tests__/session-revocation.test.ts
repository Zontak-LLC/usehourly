import { describe, expect, it, vi } from "vitest";

import { sessionStillValid } from "@/lib/session-version";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

describe("signing out other devices", () => {
  it("accepts a token that matches the account and refuses one from before a password change", () => {
    expect(sessionStillValid(3, 3)).toBe(true);
    expect(sessionStillValid(2, 3)).toBe(false); // password changed since this token was issued
    expect(sessionStillValid(4, 3)).toBe(false);
  });

  it("treats a token from before the counter existed as version 0", () => {
    expect(sessionStillValid(undefined, 0)).toBe(true);
    expect(sessionStillValid(undefined, 1)).toBe(false);
  });

  it("refuses everything for an account that no longer exists", () => {
    expect(sessionStillValid(0, null)).toBe(false);
    expect(sessionStillValid(0, undefined)).toBe(false);
  });

  it("bumps the version when the password changes, so every older token dies", async () => {
    const { hash } = await import("bcryptjs");
    const prisma = {
      ...memoryRateLimit(),
      authUser: {
        findUnique: vi.fn(async () => ({ id: "u1", password_hash: await hash("old-password", 4) })),
        update: vi.fn(async () => ({ id: "u1" })),
      },
    };
    const caller = createCallerFactory(appRouter)({
      session: { user: { id: "u1" }, expires: "" },
      prisma: prisma as never,
    });

    // wrong current password: nothing is touched
    await expect(
      caller.account.changePassword({ currentPassword: "nope", newPassword: "brand-new-password" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.authUser.update).not.toHaveBeenCalled();

    await caller.account.changePassword({ currentPassword: "old-password", newPassword: "brand-new-password" });
    const data = (prisma.authUser.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.token_version).toEqual({ increment: 1 });
    expect(String(data.password_hash)).toMatch(/^\$2[aby]\$/);
  });

  it("signs out everywhere with one bump, and only for a signed-in user", async () => {
    const prisma = { authUser: { update: vi.fn(async () => ({ id: "u1" })) } };
    const signedIn = createCallerFactory(appRouter)({
      session: { user: { id: "u1" }, expires: "" },
      prisma: prisma as never,
    });
    await signedIn.account.signOutEverywhere();
    expect(prisma.authUser.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { token_version: { increment: 1 } },
    });

    const anon = createCallerFactory(appRouter)({ session: null, prisma: prisma as never });
    await expect(anon.account.signOutEverywhere()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.authUser.update).toHaveBeenCalledTimes(1);
  });
});
