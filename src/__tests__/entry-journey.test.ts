import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { withGuardedInsert } from "./helpers/guarded-insert-mock";
import { memoryNonBillableDays } from "./helpers/memory-non-billable";
import { memoryRateLimit } from "./helpers/memory-rate-limit";

const createCaller = createCallerFactory(appRouter);

function mockPrisma() {
  return {
    ...memoryNonBillableDays(),
    // findMany: entry.list reads the account's projects alongside the entries
    project: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
    timeEntry: {
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }) => ({ id: "e1", ...data })),
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ data }) => data),
      deleteMany: vi.fn(),
    },
    client: { findFirst: vi.fn(), findMany: vi.fn(async () => []), create: vi.fn(), updateMany: vi.fn() },
    authUser: { findUnique: vi.fn(), create: vi.fn() },
  };
}

type P = ReturnType<typeof mockPrisma>;
const asCaller = (prisma: P, userId: string | null) =>
  createCaller({
    session: userId ? { user: { id: userId }, expires: "" } : null,
    prisma: withGuardedInsert(prisma) as never,
  });

describe("daily time entry journey", () => {
  let prisma: P;
  beforeEach(() => {
    prisma = mockPrisma();
  });

  it("rejects every procedure when signed out", async () => {
    const c = asCaller(prisma, null);
    await expect(c.entry.list({ from: "2026-10-05", to: "2026-10-11" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(c.entry.create({ projectId: "p", date: "2026-10-09", duration: "1" })).rejects.toBeInstanceOf(
      TRPCError,
    );
    await expect(c.clients.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it("quick-adds '1:30' on an owned project and stores 90 minutes", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "p1" });
    await asCaller(prisma, "u1").entry.create({
      projectId: "p1",
      date: "2026-10-09",
      duration: "1:30",
      note: "  homepage  ",
    });
    expect(prisma.project.findFirst).toHaveBeenCalledWith({ where: { id: "p1", user_id: "u1" } });
    expect(prisma.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          id: expect.any(String),
          user_id: "u1",
          project_id: "p1",
          date: "2026-10-09",
          minutes: 90,
          note: "homepage",
        },
      }),
    );
  });

  it("refuses to log time against someone else's project", async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(
      asCaller(prisma, "u1").entry.create({ projectId: "theirs", date: "2026-10-09", minutes: 60 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("validates input: bad duration and bad date throw and never touch the DB", async () => {
    const c = asCaller(prisma, "u1");
    prisma.project.findFirst.mockResolvedValue({ id: "p1" });
    await expect(c.entry.create({ projectId: "p1", date: "2026-10-09", duration: "lots" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(c.entry.create({ projectId: "p1", date: "10/09/2026", minutes: 30 })).rejects.toBeInstanceOf(
      TRPCError,
    );
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("lists only the caller's entries within the week range", async () => {
    await asCaller(prisma, "u1").entry.list({ from: "2026-10-05", to: "2026-10-11" });
    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: "u1", date: { gte: "2026-10-05", lte: "2026-10-11" } } }),
    );
  });

  it("delete is scoped to the owner and 404s when nothing matched", async () => {
    prisma.timeEntry.deleteMany.mockResolvedValue({ count: 0 });
    await expect(asCaller(prisma, "u1").entry.delete({ id: "e9" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.timeEntry.deleteMany).toHaveBeenCalledWith({ where: { id: "e9", user_id: "u1" } });
  });

  it("moves an entry to another day without touching its hours, note or project", async () => {
    prisma.timeEntry.findFirst.mockResolvedValue({
      id: "e1",
      user_id: "u1",
      project_id: "p1",
      date: "2026-10-06",
      minutes: 180,
      note: "ISSUE-42",
    });
    const c = asCaller(prisma, "u1");
    await c.entry.update({ id: "e1", date: "2026-12-24" }); // any day of the year
    const call = prisma.timeEntry.update.mock.calls.at(-1);
    if (!call) throw new Error("update was not called");
    const arg = call[0] as { where: { id: string }; data: Record<string, unknown> };
    expect(arg.where).toEqual({ id: "e1", user_id: "u1" });
    expect(arg.data).toEqual({ date: "2026-12-24" }); // only the date is written
    expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith({ where: { id: "e1", user_id: "u1" } });

    // A malformed date is rejected before anything is written.
    prisma.timeEntry.update.mockClear();
    await expect(c.entry.update({ id: "e1", date: "Dec 24" })).rejects.toThrow();
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();

    // Someone else's entry can't be moved.
    prisma.timeEntry.findFirst.mockResolvedValue(null as never);
    await expect(c.entry.update({ id: "theirs", date: "2026-12-24" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it("saves a description from the week grid without touching hours or project", async () => {
    const lastUpdate = () => {
      const call = prisma.timeEntry.update.mock.calls.at(-1);
      if (!call) throw new Error("update was not called");
      return call[0] as { where: { id: string }; data: Record<string, unknown> };
    };
    prisma.timeEntry.findFirst.mockResolvedValue({ id: "e1", user_id: "u1", project_id: "p1", minutes: 90 });
    await asCaller(prisma, "u1").entry.update({ id: "e1", note: "  homepage hero polish  " });
    expect(lastUpdate().where).toEqual({ id: "e1", user_id: "u1" });
    expect(lastUpdate().data).toEqual({ note: "homepage hero polish" }); // trimmed, nothing else changed

    // Clearing a description is allowed and stores an empty note.
    await asCaller(prisma, "u1").entry.update({ id: "e1", note: "" });
    expect(lastUpdate().data).toEqual({ note: "" });

    // A note over the 500-character limit is rejected and nothing is written.
    prisma.timeEntry.update.mockClear();
    await expect(asCaller(prisma, "u1").entry.update({ id: "e1", note: "x".repeat(2001) })).rejects.toThrow();
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it("creates a day's entry with its description in one step from an empty grid cell", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "p1" });
    await asCaller(prisma, "u1").entry.create({
      projectId: "p1",
      date: "2026-10-12",
      minutes: 120,
      note: "client call and follow-ups",
    });
    expect(prisma.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: "u1",
          project_id: "p1",
          date: "2026-10-12",
          minutes: 120,
          note: "client call and follow-ups",
        }),
      }),
    );
  });

  it("quick-creates the same entry on several days, skipping days that already have the project", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "p1" });
    prisma.timeEntry.findMany.mockResolvedValue([{ date: "2026-10-07" }] as never);
    const res = await asCaller(prisma, "u1").entry.createMany({
      projectId: "p1",
      dates: ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-06"], // duplicate date is collapsed
      minutes: 120,
      note: "  weekly retainer work  ",
    });
    expect(res).toEqual({ created: 2, skipped: ["2026-10-07"] });
    expect(prisma.project.findFirst).toHaveBeenCalledWith({ where: { id: "p1", user_id: "u1" } });
    expect(prisma.timeEntry.create).toHaveBeenCalledTimes(2);
    const made = prisma.timeEntry.create.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
    expect(made).toEqual([
      { user_id: "u1", project_id: "p1", date: "2026-10-06", minutes: 120, note: "weekly retainer work" },
      { user_id: "u1", project_id: "p1", date: "2026-10-08", minutes: 120, note: "weekly retainer work" },
    ]);
  });

  it("quick-create can double up a day on purpose, and refuses foreign projects and oversized batches", async () => {
    const c = asCaller(prisma, "u1");
    prisma.project.findFirst.mockResolvedValue({ id: "p1" });
    const res = await c.entry.createMany({
      projectId: "p1",
      dates: ["2026-10-07"],
      minutes: 60,
      skipExisting: false,
    });
    expect(res).toEqual({ created: 1, skipped: [] });
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled(); // no existing-check when not skipping

    prisma.timeEntry.create.mockClear();
    prisma.project.findFirst.mockResolvedValue(null as never);
    await expect(
      c.entry.createMany({ projectId: "someone-elses", dates: ["2026-10-07"], minutes: 60 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const many = Array.from({ length: 32 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    await expect(c.entry.createMany({ projectId: "p1", dates: many, minutes: 60 })).rejects.toThrow();
    await expect(
      asCaller(prisma, null).entry.createMany({ projectId: "p1", dates: ["2026-10-07"], minutes: 60 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("reassigns an entry to another owned project without touching its minutes or note", async () => {
    prisma.timeEntry.findFirst.mockResolvedValue({ id: "e1", user_id: "u1", project_id: "p1", minutes: 90 });
    prisma.project.findFirst.mockResolvedValue({ id: "p2" });
    await asCaller(prisma, "u1").entry.update({ id: "e1", projectId: "p2" });
    expect(prisma.project.findFirst).toHaveBeenCalledWith({ where: { id: "p2", user_id: "u1" } });
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e1", user_id: "u1" }, data: { project_id: "p2" } }),
    );
  });

  it("refuses to move an entry onto someone else's project (and writes nothing)", async () => {
    prisma.timeEntry.findFirst.mockResolvedValue({ id: "e1", user_id: "u1", project_id: "p1" });
    prisma.project.findFirst.mockResolvedValue(null); // scoped by user_id → not found
    await expect(asCaller(prisma, "u1").entry.update({ id: "e1", projectId: "other-users" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it("timer: two starts at the same moment leave one running timer and give the loser a plain message", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "p1" });
    prisma.timeEntry.findFirst.mockResolvedValue(null); // both calls saw "nothing running"
    // The database allows one running timer per account (migration 0024), so the second create is refused.
    prisma.timeEntry.create
      .mockResolvedValueOnce({ id: "first", started_at: new Date() } as never)
      .mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed on user_id"), { code: "P2002" }));
    const owner = asCaller(prisma, "u1");
    const results = await Promise.allSettled([
      owner.entry.start({ projectId: "p1", date: "2026-10-09" }),
      owner.entry.start({ projectId: "p1", date: "2026-10-09" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: "CONFLICT", message: "A timer is already running. Stop it first." });
    // other failures are not disguised as that message
    prisma.timeEntry.create.mockRejectedValueOnce(new Error("database is down"));
    await expect(owner.entry.start({ projectId: "p1", date: "2026-10-09" })).rejects.toThrow("database is down");
  });

  it("timer: starting a second timer stops the first and banks its elapsed minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
    prisma.project.findFirst.mockResolvedValue({ id: "p2" });
    prisma.timeEntry.findFirst.mockResolvedValue({
      id: "run1",
      minutes: 10,
      started_at: new Date("2026-10-09T09:15:00Z"),
    });
    await asCaller(prisma, "u1").entry.start({ projectId: "p2", date: "2026-10-09" });
    // 10 banked + 45 elapsed
    expect(prisma.timeEntry.update).toHaveBeenCalledWith({
      where: { id: "run1", user_id: "u1" },
      data: { minutes: 55, started_at: null },
    });
    expect(prisma.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          project_id: "p2",
          user_id: "u1",
          started_at: new Date("2026-10-09T10:00:00Z"),
        }),
      }),
    );
    vi.useRealTimers();
  });

  it("timer: stop with nothing running is a NOT_FOUND, and sub-minute runs round up to 1", async () => {
    const c = asCaller(prisma, "u1");
    prisma.timeEntry.findFirst.mockResolvedValue(null);
    await expect(c.entry.stop()).rejects.toMatchObject({ code: "NOT_FOUND" });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T10:00:20Z"));
    prisma.timeEntry.findFirst.mockResolvedValue({ id: "r", minutes: 0, started_at: new Date("2026-10-09T10:00:00Z") });
    await c.entry.stop();
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { minutes: 1, started_at: null } }),
    );
    vi.useRealTimers();
  });
});

describe("resuming a stopped timer (Today's Resume button)", () => {
  it("runs the same entry again after stopping any other timer, and the next stop adds to what it held", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T10:00:00Z"));
    const prisma = mockPrisma();
    prisma.timeEntry.findFirst
      .mockResolvedValueOnce({ id: "e1", user_id: "u1", minutes: 13, started_at: null })
      .mockResolvedValueOnce({ id: "other", minutes: 5, started_at: new Date("2026-10-23T09:50:00Z") });
    await asCaller(prisma, "u1").entry.resume({ id: "e1" });
    expect(prisma.timeEntry.findFirst).toHaveBeenNthCalledWith(1, { where: { id: "e1", user_id: "u1" } });
    // The other timer is banked first: 5 + 10 elapsed.
    expect(prisma.timeEntry.update).toHaveBeenNthCalledWith(1, {
      where: { id: "other", user_id: "u1" },
      data: { minutes: 15, started_at: null },
    });
    expect(prisma.timeEntry.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: "e1", user_id: "u1" },
        data: { started_at: new Date("2026-10-23T10:00:00Z") },
      }),
    );

    // Twenty minutes later the stop adds 20 to the 13 already banked.
    vi.setSystemTime(new Date("2026-10-23T10:20:00Z"));
    prisma.timeEntry.update.mockClear();
    prisma.timeEntry.findFirst.mockResolvedValueOnce({
      id: "e1",
      minutes: 13,
      started_at: new Date("2026-10-23T10:00:00Z"),
    });
    await asCaller(prisma, "u1").entry.stop();
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { minutes: 33, started_at: null } }),
    );
    vi.useRealTimers();
  });

  it("refuses another account's entry and a missing id, touching nothing", async () => {
    const prisma = mockPrisma();
    prisma.timeEntry.findFirst.mockResolvedValue(null);
    await expect(asCaller(prisma, "u2").entry.resume({ id: "e1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith({ where: { id: "e1", user_id: "u2" } });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();

    prisma.timeEntry.findFirst.mockClear();
    await expect(asCaller(prisma, "u1").entry.resume({ id: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.timeEntry.findFirst).not.toHaveBeenCalled();
  });

  it("will not resume an entry that already holds a full day", async () => {
    const prisma = mockPrisma();
    prisma.timeEntry.findFirst.mockResolvedValue({ id: "e1", user_id: "u1", minutes: 1440, started_at: null });
    await expect(asCaller(prisma, "u1").entry.resume({ id: "e1" })).rejects.toThrow("already holds a full day");
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });
});

describe("a timer left running for days", () => {
  it("stop banks at most one day, however long it ran", async () => {
    const prisma = mockPrisma();
    const caller = asCaller(prisma, "u1");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
    // started three days ago and forgotten
    prisma.timeEntry.findFirst.mockResolvedValue({
      id: "r",
      minutes: 30,
      started_at: new Date("2026-10-09T10:00:00Z"),
    });
    await caller.entry.stop();
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { minutes: 1440, started_at: null } }),
    );
    vi.useRealTimers();
  });

  it("starting another timer banks at most one day of the forgotten one too", async () => {
    const prisma = mockPrisma();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
    prisma.project.findFirst.mockResolvedValue({ id: "p2" });
    prisma.timeEntry.findFirst.mockResolvedValue({
      id: "run1",
      minutes: 0,
      started_at: new Date("2026-10-01T10:00:00Z"),
    });
    await asCaller(prisma, "u1").entry.start({ projectId: "p2", date: "2026-10-12" });
    expect(prisma.timeEntry.update).toHaveBeenCalledWith({
      where: { id: "run1", user_id: "u1" },
      data: { minutes: 1440, started_at: null },
    });
    vi.useRealTimers();
  });

  it("a normal run is not cut short", async () => {
    const prisma = mockPrisma();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    prisma.timeEntry.findFirst.mockResolvedValue({
      id: "r",
      minutes: 15,
      started_at: new Date("2026-10-09T10:00:00Z"),
    });
    await asCaller(prisma, "u1").entry.stop();
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { minutes: 135, started_at: null } }),
    );
    vi.useRealTimers();
  });
});

describe("timer: started earlier (Today's -15 min / -30 min / -1 hour chips)", () => {
  const T0 = new Date("2026-10-23T10:00:00Z");
  function runningAt(startedAt: Date, extra: Record<string, unknown> = {}) {
    const prisma = mockPrisma();
    prisma.timeEntry.findFirst.mockResolvedValue({
      id: "run",
      user_id: "u1",
      minutes: 0,
      started_at: startedAt,
      ...extra,
    });
    return prisma;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T10:01:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("moves the caller's own running start back by the chosen minutes, only if it has not changed meanwhile", async () => {
    const prisma = runningAt(T0);
    await asCaller(prisma, "u1").entry.shiftStart({ minutes: 30, tzOffset: 0 });
    expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith({ where: { user_id: "u1", started_at: { not: null } } });
    expect(prisma.timeEntry.update).toHaveBeenCalledTimes(1);
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run", user_id: "u1", started_at: T0 },
        data: { started_at: new Date("2026-10-23T09:30:00Z") },
      }),
    );

    // The stop that follows counts from the new start: 09:30 to 10:31 is 61 minutes.
    vi.setSystemTime(new Date("2026-10-23T10:31:00Z"));
    prisma.timeEntry.update.mockClear();
    prisma.timeEntry.findFirst.mockResolvedValue({
      id: "run",
      minutes: 0,
      started_at: new Date("2026-10-23T09:30:00Z"),
    });
    await asCaller(prisma, "u1").entry.stop();
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { minutes: 61, started_at: null } }),
    );
  });

  it("never touches another account's timer: with none running for the caller it is NOT_FOUND", async () => {
    const prisma = mockPrisma();
    prisma.timeEntry.findFirst.mockResolvedValue(null); // u1's timer is not visible under u2's filter
    await expect(asCaller(prisma, "u2").entry.shiftStart({ minutes: 15, tzOffset: 0 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith({ where: { user_id: "u2", started_at: { not: null } } });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();

    await expect(asCaller(prisma, null).entry.shiftStart({ minutes: 15, tzOffset: 0 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("validates input (0, over 12 hours, fractions, a made-up time zone) and never reads or writes", async () => {
    const prisma = runningAt(T0);
    const c = asCaller(prisma, "u1");
    for (const bad of [
      { minutes: 0, tzOffset: 0 },
      { minutes: 721, tzOffset: 0 },
      { minutes: 1.5, tzOffset: 0 },
      { minutes: 15, tzOffset: 900 },
    ]) {
      await expect(c.entry.shiftStart(bad)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(prisma.timeEntry.findFirst).not.toHaveBeenCalled();
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it("refuses a start more than 12 hours ago, and writes nothing", async () => {
    vi.setSystemTime(new Date("2026-10-23T20:00:00Z"));
    const prisma = runningAt(new Date("2026-10-23T10:00:00Z")); // already 10 hours
    await expect(asCaller(prisma, "u1").entry.shiftStart({ minutes: 180, tzOffset: 0 })).rejects.toThrow(
      "at most 12 hours ago",
    );
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it("refuses to move the start to the day before in the person's own time zone", async () => {
    // 05:10 UTC is 00:10 in New York (offset 300): 15 minutes back is yesterday there.
    vi.setSystemTime(new Date("2026-10-23T05:11:00Z"));
    const prisma = runningAt(new Date("2026-10-23T05:10:00Z"));
    await expect(asCaller(prisma, "u1").entry.shiftStart({ minutes: 15, tzOffset: 300 })).rejects.toThrow("day before");
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();

    // The same moment in London (offset 0) is 05:10, so the same shift is fine.
    await asCaller(prisma, "u1").entry.shiftStart({ minutes: 15, tzOffset: 0 });
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { started_at: new Date("2026-10-23T04:55:00Z") } }),
    );
  });

  it("gives a plain message when the timer was stopped or moved at the same moment", async () => {
    const prisma = runningAt(T0);
    prisma.timeEntry.update.mockRejectedValueOnce(Object.assign(new Error("not found"), { code: "P2025" }));
    await expect(asCaller(prisma, "u1").entry.shiftStart({ minutes: 15, tzOffset: 0 })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "The timer changed. Please try again.",
    });
  });
});

describe("timer: still working? (stop at an earlier moment)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("stops the caller's timer 60 minutes ago: only the time up to then is kept, on top of what it held", async () => {
    const prisma = mockPrisma();
    prisma.timeEntry.findFirst.mockResolvedValue({
      id: "r",
      minutes: 10,
      started_at: new Date("2026-10-23T10:00:00Z"),
    });
    await asCaller(prisma, "u1").entry.stop({ minutesAgo: 60 });
    expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith({ where: { user_id: "u1", started_at: { not: null } } });
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "r", user_id: "u1" }, data: { minutes: 250, started_at: null } }),
    );
  });

  it("refuses a moment before the timer started, and bad input, writing nothing", async () => {
    const prisma = mockPrisma();
    prisma.timeEntry.findFirst.mockResolvedValue({ id: "r", minutes: 0, started_at: new Date("2026-10-23T14:30:00Z") });
    await expect(asCaller(prisma, "u1").entry.stop({ minutesAgo: 30 })).rejects.toThrow("had not started then");
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();

    prisma.timeEntry.findFirst.mockClear();
    for (const minutesAgo of [0, -5, 1441, 2.5]) {
      await expect(asCaller(prisma, "u1").entry.stop({ minutesAgo })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(prisma.timeEntry.findFirst).not.toHaveBeenCalled();
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });
});

describe("registration", () => {
  it("normalizes email, hashes the password, and rejects duplicates", async () => {
    const prisma = mockPrisma();
    prisma.authUser.findUnique.mockResolvedValueOnce(null);
    prisma.authUser.create.mockResolvedValue({ id: "new" });
    const c = asCaller(prisma, null);
    await c.account.register({ name: "Jo", email: "  Jo@Example.COM ", password: "supersecret" });
    const data = prisma.authUser.create.mock.calls[0][0].data;
    expect(data.email).toBe("jo@example.com");
    expect(data.password_hash).not.toBe("supersecret");

    prisma.authUser.findUnique.mockResolvedValueOnce({ id: "x" });
    await expect(
      c.account.register({ name: "Jo", email: "jo@example.com", password: "supersecret" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(c.account.register({ name: "Jo", email: "a@b.co", password: "short" })).rejects.toBeInstanceOf(
      TRPCError,
    );
    expect(prisma.authUser.create).toHaveBeenCalledTimes(1);
  });
});

describe("member account", () => {
  it("requires sign-in for me / updateProfile / changePassword", async () => {
    const prisma = mockPrisma();
    const c = asCaller(prisma, null);
    await expect(c.account.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(c.account.updateProfile({ name: "X" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(c.account.changePassword({ currentPassword: "a", newPassword: "longenough" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(prisma.authUser.findUnique).not.toHaveBeenCalled();
  });

  it("changes password only when the current one matches, and stores a new hash", async () => {
    const { hash } = await import("bcryptjs");
    const prisma = { ...mockPrisma(), ...memoryRateLimit() } as ReturnType<typeof mockPrisma> &
      ReturnType<typeof memoryRateLimit> & { authUser: { update: ReturnType<typeof vi.fn> } };
    prisma.authUser.update = vi.fn();
    prisma.authUser.findUnique.mockResolvedValue({ id: "u1", password_hash: await hash("oldpassword", 4) });
    const c = asCaller(prisma, "u1");

    await expect(
      c.account.changePassword({ currentPassword: "wrong", newPassword: "newpassword1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.authUser.update).not.toHaveBeenCalled();

    await expect(
      c.account.changePassword({ currentPassword: "oldpassword", newPassword: "short" }),
    ).rejects.toBeInstanceOf(TRPCError);
    expect(prisma.authUser.update).not.toHaveBeenCalled();

    await c.account.changePassword({ currentPassword: "oldpassword", newPassword: "newpassword1" });
    const call = prisma.authUser.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "u1" });
    expect(call.data.password_hash).not.toBe("newpassword1");
  });
});

describe("managing multiple projects", () => {
  function projectPrisma() {
    return {
      ...mockPrisma(),
      project: { findFirst: vi.fn(), update: vi.fn(async ({ data }) => data), updateMany: vi.fn() },
      client: { findFirst: vi.fn(), updateMany: vi.fn() },
    };
  }

  it("moves a project to another of the user's clients and renames it", async () => {
    const prisma = projectPrisma();
    prisma.project.findFirst
      .mockResolvedValueOnce({ id: "p1", name: "Site", client_id: "c1" }) // the project
      .mockResolvedValueOnce(null); // no duplicate under the target client
    prisma.client.findFirst.mockResolvedValue({ id: "c2" });
    await asCaller(prisma as never, "u1").project.update({
      id: "p1",
      name: "Redesign",
      clientId: "c2",
      hourlyRate: 12000,
    });
    expect(prisma.client.findFirst).toHaveBeenCalledWith({ where: { id: "c2", user_id: "u1" } });
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: "p1", user_id: "u1" },
      data: { name: "Redesign", client_id: "c2", hourly_rate: 12000 },
      omit: { logo: true },
    });
  });

  it("links a logo to a project, leaves it alone on other edits, and clears it with null", async () => {
    const prisma = projectPrisma();
    const c = asCaller(prisma as never, "u1");
    const png = "data:image/png;base64,iVBORw0KGgo=";
    prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Site", client_id: "c1" });

    await c.project.update({ id: "p1", logo: png });
    expect(prisma.project.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "p1", user_id: "u1" }, data: expect.objectContaining({ logo: png }) }),
    );

    // An ordinary edit (no logo field) must not touch the stored logo.
    await c.project.update({ id: "p1", hourlyRate: 9000 });
    const untouched = prisma.project.update.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> };
    expect("logo" in untouched.data).toBe(false);

    await c.project.update({ id: "p1", logo: null });
    expect(prisma.project.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ logo: null }) }),
    );

    prisma.project.update.mockClear();
    await expect(c.project.update({ id: "p1", logo: "data:text/html;base64,PHNjcmlwdD4=" })).rejects.toThrow(
      "PNG or JPEG",
    );
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it("serves logos as one id→image map, scoped to the caller", async () => {
    const prisma = projectPrisma() as ReturnType<typeof projectPrisma> & {
      project: { findMany: ReturnType<typeof vi.fn> };
    };
    prisma.project.findMany = vi.fn(async () => [
      { id: "p1", logo: "data:image/png;base64,AAAA" },
      { id: "p2", logo: null },
    ]);
    const map = await asCaller(prisma as never, "u1").project.logos();
    expect(map).toEqual({ p1: "data:image/png;base64,AAAA" });
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: "u1", logo: { not: null } } }),
    );
    await expect(asCaller(prisma as never, null).project.logos()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses to move a project to a client the user doesn't own, or to a duplicate name", async () => {
    const prisma = projectPrisma();
    prisma.project.findFirst.mockResolvedValue({ id: "p1", name: "Site", client_id: "c1" });
    prisma.client.findFirst.mockResolvedValueOnce(null);
    const c = asCaller(prisma as never, "u1");
    await expect(c.project.update({ id: "p1", clientId: "theirs" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    prisma.client.findFirst.mockResolvedValueOnce({ id: "c2" });
    prisma.project.findFirst
      .mockResolvedValueOnce({ id: "p1", name: "Site", client_id: "c1" })
      .mockResolvedValueOnce({ id: "other" });
    await expect(c.project.update({ id: "p1", clientId: "c2" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it("restoring a project also restores its archived client", async () => {
    const prisma = projectPrisma();
    prisma.project.findFirst.mockResolvedValue({ id: "p1", client_id: "c1" });
    await asCaller(prisma as never, "u1").project.unarchive({ id: "p1" });
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: "p1", user_id: "u1" },
      data: { archived: false },
    });
    expect(prisma.client.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", user_id: "u1" },
      data: { archived: false },
    });
  });

  it("project management requires sign-in", async () => {
    const prisma = projectPrisma();
    const c = asCaller(prisma as never, null);
    await expect(c.project.update({ id: "p1", name: "x" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(c.project.listArchived()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
  });
});

/** The global search (top bar) looks through the signed-in account's own entries only. */
describe("entry search journey", () => {
  const rows = [
    { id: "e2", user_id: "u1", project_id: "p1", date: "2026-10-19", minutes: 120, note: "Invoice maths for Acme" },
    { id: "e1", user_id: "u1", project_id: "p1", date: "2026-10-12", minutes: 30, note: "Invoice layout" },
  ];
  const project = { id: "p1", name: "Website", client: { name: "Acme" } };

  it("finds entries by every typed word, newest first, with their project and client, for the caller only", async () => {
    const prisma = mockPrisma();
    prisma.timeEntry.findMany.mockResolvedValue(rows as never);
    prisma.project.findMany.mockResolvedValue([project] as never);
    const found = await asCaller(prisma, "u1").entry.search({ q: "  invoice  maths " });
    expect(found).toEqual([
      {
        id: "e2",
        date: "2026-10-19",
        minutes: 120,
        note: "Invoice maths for Acme",
        project: "Website",
        client: "Acme",
      },
      { id: "e1", date: "2026-10-12", minutes: 30, note: "Invoice layout", project: "Website", client: "Acme" },
    ]);
    // the account filter is the isolation boundary, on the entries AND on the projects
    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: "u1", AND: [{ note: { contains: "invoice" } }, { note: { contains: "maths" } }] },
        take: 8,
      }),
    );
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: "u1", id: { in: ["p1"] } } }),
    );
  });

  it("returns nothing without asking for projects when no entry matches", async () => {
    const prisma = mockPrisma();
    expect(await asCaller(prisma, "u1").entry.search({ q: "zzzz" })).toEqual([]);
    expect(prisma.project.findMany).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller and a search that is too short or too long (and never reads)", async () => {
    const prisma = mockPrisma();
    await expect(asCaller(prisma, null).entry.search({ q: "invoice" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(asCaller(prisma, "u1").entry.search({ q: "a" })).rejects.toBeInstanceOf(TRPCError);
    await expect(asCaller(prisma, "u1").entry.search({ q: "x".repeat(101) })).rejects.toBeInstanceOf(TRPCError);
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
  });
});
