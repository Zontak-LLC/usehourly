import { describe, expect, it, vi } from "vitest";

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryNonBillableDays } from "./helpers/memory-non-billable";

const createCaller = createCallerFactory(appRouter);

type Row = { id: string; user_id: string; date: string; minutes: number };

/** A timeEntry table that honours where.user_id, `take`, and a cursor on id, like Prisma. */
function fakeEntries(rows: Row[]) {
  const findMany = vi.fn(async (args: { where: { user_id: string }; take?: number; cursor?: { id: string } }) => {
    const mine = rows.filter((r) => r.user_id === args.where.user_id);
    const start = args.cursor ? mine.findIndex((r) => r.id === args.cursor?.id) : 0;
    return mine.slice(Math.max(start, 0), Math.max(start, 0) + (args.take ?? mine.length));
  });
  return {
    timeEntry: { findMany },
    project: { findMany: vi.fn(async () => []) },
    client: { findMany: vi.fn(async () => []) },
    ...memoryNonBillableDays(),
  };
}
const asUser = (prisma: object, id = "u1") =>
  createCaller({ session: { user: { id }, expires: "" }, prisma: prisma as never });

describe("listing entries cannot be turned into a huge read", () => {
  it("serves up to a leap year at a time and refuses wider, reversed or impossible ranges without querying", async () => {
    const prisma = fakeEntries([]);
    const c = asUser(prisma);
    await c.entry.list({ from: "2028-01-01", to: "2028-12-31" }); // 366 days
    expect(prisma.timeEntry.findMany).toHaveBeenCalledTimes(1);

    await expect(c.entry.list({ from: "2026-01-01", to: "2027-01-02" })).rejects.toThrow(/up to a year/);
    await expect(c.entry.list({ from: "1900-01-01", to: "2999-12-31" })).rejects.toThrow(/up to a year/);
    await expect(c.entry.list({ from: "2026-10-31", to: "2026-10-01" })).rejects.toThrow(/before/);
    await expect(c.entry.list({ from: "2026-02-30", to: "2026-03-01" })).rejects.toThrow(/real date/);
    expect(prisma.timeEntry.findMany).toHaveBeenCalledTimes(1);
  });

  it("hands over everything in bounded pages for 'export everything': each entry once, only the caller's own", async () => {
    const mine: Row[] = Array.from({ length: 4500 }, (_, i) => ({
      id: `e${String(i).padStart(5, "0")}`,
      user_id: "u1",
      date: "2026-10-01",
      minutes: 1,
    }));
    const theirs: Row[] = [{ id: "x1", user_id: "u2", date: "2026-10-01", minutes: 999 }];
    const prisma = fakeEntries([...theirs, ...mine]);
    const c = asUser(prisma);

    const seen: string[] = [];
    let cursor: string | null = null;
    const pageSizes: number[] = [];
    for (let guard = 0; guard < 10; guard++) {
      const page: { items: { id: string }[]; nextCursor: string | null } = await c.entry.listAll({ cursor });
      pageSizes.push(page.items.length);
      seen.push(...page.items.map((r) => r.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(pageSizes).toEqual([2000, 2000, 500]);
    expect(seen).toHaveLength(4500);
    expect(new Set(seen).size).toBe(4500);
    expect(seen).not.toContain("x1");
    for (const call of prisma.timeEntry.findMany.mock.calls) {
      expect(call[0].where).toEqual({ user_id: "u1" });
      expect(call[0].take).toBe(2001); // one extra row tells it whether another page exists
    }
  });

  it("returns an empty list and no next page for an account with no entries", async () => {
    const page = await asUser(fakeEntries([])).entry.listAll({});
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it("needs a signed-in user, and refuses a runaway cursor", async () => {
    const prisma = fakeEntries([]);
    const anon = createCaller({ session: null, prisma: prisma as never });
    await expect(anon.entry.listAll({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(asUser(prisma).entry.listAll({ cursor: "x".repeat(101) })).rejects.toThrow();
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
  });
});
