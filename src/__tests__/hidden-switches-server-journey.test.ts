import { describe, expect, it, vi } from "vitest";

import { feature } from "@/lib/features";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryNonBillableDays } from "./helpers/memory-non-billable";

/**
 * Non-billable days and profile pictures are hidden in this release (real switches, no mock). Calling the server
 * directly cannot mark a day or save a picture either: both answer "Not found." before any read or write, the way
 * every hidden feature does. A signed-out caller is still asked to sign in first.
 */

const createCaller = createCallerFactory(appRouter);

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const NOT_FOUND = { code: "NOT_FOUND", message: "Not found." };

function world() {
  const days = memoryNonBillableDays([{ user_id: "u1", date: "2026-11-02" }]);
  const prisma = { ...days, authUser: { update: vi.fn(async () => ({ id: "u1" })) } };
  const as = (id: string | null) =>
    createCaller({ session: id ? { user: { id }, expires: "" } : null, prisma: prisma as never });
  return { prisma, as, rows: days.nonBillableRows };
}

function expectDaysUntouched(w: ReturnType<typeof world>) {
  expect(w.prisma.nonBillableDay.findUnique).not.toHaveBeenCalled();
  expect(w.prisma.nonBillableDay.count).not.toHaveBeenCalled();
  expect(w.prisma.nonBillableDay.create).not.toHaveBeenCalled();
  expect(w.prisma.nonBillableDay.deleteMany).not.toHaveBeenCalled();
  expect(w.rows).toEqual([{ user_id: "u1", date: "2026-11-02" }]);
}

describe("while non-billable days are hidden", () => {
  it("runs with the release's real switch", () => {
    expect(feature("nonBillableDays")).toBe(false);
  });

  it("refuses to mark or un-mark a day, as not found, and touches nothing", async () => {
    const w = world();
    for (const nonBillable of [true, false]) {
      await expect(w.as("u1").entry.setNonBillable({ date: "2026-11-02", nonBillable })).rejects.toMatchObject(
        NOT_FOUND,
      );
    }
    expectDaysUntouched(w);
  });

  it("still asks a signed-out caller to sign in first", async () => {
    const w = world();
    await expect(w.as(null).entry.setNonBillable({ date: "2026-11-02", nonBillable: true })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expectDaysUntouched(w);
  });

  it("still lists the days marked earlier", async () => {
    const w = world();
    expect(await w.as("u1").entry.nonBillableDays({ from: "2026-11-01", to: "2026-11-30" })).toEqual(["2026-11-02"]);
  });
});

describe("while profile pictures are hidden", () => {
  it("runs with the release's real switch", () => {
    expect(feature("avatar")).toBe(false);
  });

  it("refuses to save or remove a picture, as not found, and writes nothing", async () => {
    const w = world();
    for (const avatar of [PNG, null]) {
      await expect(w.as("u1").account.setAvatar({ avatar })).rejects.toMatchObject(NOT_FOUND);
    }
    expect(w.prisma.authUser.update).not.toHaveBeenCalled();
  });

  it("still asks a signed-out caller to sign in first", async () => {
    const w = world();
    await expect(w.as(null).account.setAvatar({ avatar: PNG })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(w.prisma.authUser.update).not.toHaveBeenCalled();
  });
});
