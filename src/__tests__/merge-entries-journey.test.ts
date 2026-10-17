import { beforeEach, describe, expect, it, vi } from "vitest";

import { NOTE_MAX } from "@/lib/notes";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

type Row = {
  id: string;
  user_id: string;
  project_id: string;
  date: string;
  minutes: number;
  note: string;
  started_at: Date | null;
};
const row = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  user_id: "u1",
  project_id: "p1",
  date: "2026-10-16",
  minutes: 60,
  note: `work ${id}`,
  started_at: null,
  ...over,
});

function mockPrisma(rows: Row[]) {
  return {
    timeEntry: {
      findMany: vi.fn(async ({ where }) =>
        rows.filter((r) => where.id.in.includes(r.id) && r.user_id === where.user_id),
      ),
      update: vi.fn(async ({ data }) => data),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    authUser: { findUnique: vi.fn(), create: vi.fn() },
  };
}
type P = ReturnType<typeof mockPrisma>;
const asUser = (prisma: P, id: string | null = "u1") =>
  createCaller({ session: id ? { user: { id }, expires: "" } : null, prisma: prisma as never });

describe("merge several entries from one day into one", () => {
  let prisma: P;
  beforeEach(() => {
    prisma = mockPrisma([
      row("a", { minutes: 90, note: "Store features" }),
      row("b", { minutes: 45, note: "Bird follow-up" }),
      row("c", { minutes: 30, note: "" }),
      row("d", { minutes: 20, note: "store features" }),
      row("run", { started_at: new Date() }),
      row("other", { project_id: "p2" }),
      row("otherday", { date: "2026-10-15" }),
      row("theirs", { user_id: "u2" }),
      row("big1", { note: "x".repeat(1500) }),
      row("big2", { note: "y".repeat(600) }),
      row("long1", { minutes: 800 }),
      row("long2", { minutes: 700 }),
    ]);
  });

  it("sums hours, joins distinct descriptions in order, keeps the first entry and deletes the rest", async () => {
    const r = await asUser(prisma).entry.merge({ ids: ["a", "b", "c", "d"] });
    expect(r).toEqual({ id: "a", minutes: 185, merged: 4 });
    expect(prisma.timeEntry.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { minutes: 185, note: "Store features\nBird follow-up" }, // blank and repeat skipped
    });
    expect(prisma.timeEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["b", "c", "d"] }, user_id: "u1" },
    });
  });

  it("updates the kept entry before deleting the others", async () => {
    await asUser(prisma).entry.merge({ ids: ["a", "b"] });
    expect(prisma.timeEntry.update.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.timeEntry.deleteMany.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["different projects", ["a", "other"], "different projects"],
    ["different days", ["a", "otherday"], "same day"],
    ["a running timer", ["a", "run"], "running timer"],
    ["more than 24 hours", ["long1", "long2"], "24 hours"],
    ["a description over the limit", ["big1", "big2"], String(NOTE_MAX.toLocaleString("en-US"))],
  ])("refuses %s and changes nothing", async (_n, ids, message) => {
    await expect(asUser(prisma).entry.merge({ ids })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(message),
    });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    expect(prisma.timeEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("never touches someone else's entry", async () => {
    await expect(asUser(prisma).entry.merge({ ids: ["a", "theirs"] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    expect(prisma.timeEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("needs two different entries and a signed-in user", async () => {
    await expect(asUser(prisma).entry.merge({ ids: ["a"] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(asUser(prisma).entry.merge({ ids: ["a", "a"] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(asUser(prisma, null).entry.merge({ ids: ["a", "b"] })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });
});
