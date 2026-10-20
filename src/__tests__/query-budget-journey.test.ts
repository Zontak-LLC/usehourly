import { describe, expect, it, vi } from "vitest";

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * D1 charges a network round trip per query, so what a screen's data costs is the number of queries IN SEQUENCE, not
 * the number of rows. These tests pin the shape of the busiest reads: independent reads start together, and a lookup
 * that has nothing to find is not made at all.
 */
function world(opts: { entries: Record<string, unknown>[]; authors?: { id: string; name: string | null }[] }) {
  const events: string[] = [];
  /** A query that notes when it starts and when it ends, with a real pause between, so overlap is visible. */
  const timed = <T>(label: string, rows: T) =>
    vi.fn(async (..._args: unknown[]) => {
      events.push(`start ${label}`);
      await new Promise((r) => setTimeout(r, 5));
      events.push(`end ${label}`);
      return rows;
    });
  const prisma = {
    timeEntry: { findMany: timed("entries", opts.entries) },
    project: {
      findMany: timed("projects", [
        { id: "p1", user_id: "u1", name: "Site", client: { id: "c1", name: "Acme", color: "#111" } },
      ]),
    },
    nonBillableDay: { findMany: timed("days", [{ date: "2026-10-12" }]) },
    authUser: { findMany: timed("authors", opts.authors ?? []) },
  };
  const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
  return { prisma, caller, events };
}

const entry = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  user_id: "u1",
  project_id: "p1",
  date: "2026-10-12",
  minutes: 60,
  note: "",
  started_at: null,
  author_id: null,
  ...over,
});
const range = { from: "2026-10-12", to: "2026-10-18" };

describe("a list of entries costs one round of queries", () => {
  it("starts the entries, the projects and the non-billable days together, then joins them itself", async () => {
    const { caller, events } = world({ entries: [entry("e1")] });
    const rows = await caller.entry.list(range);
    // all three started before any finished: one round trip, not entries -> projects -> clients in a chain
    expect(events.slice(0, 3).sort()).toEqual(["start days", "start entries", "start projects"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "e1",
      project: { name: "Site", client: { name: "Acme" } },
      author: null,
      non_billable: true, // 2026-10-12 is marked non-billable
    });
  });

  it("makes no lookup for authors when nobody but the owner typed an entry", async () => {
    const { prisma, caller } = world({ entries: [entry("e1"), entry("e2", { date: "2026-10-13" })] });
    await caller.entry.list(range);
    expect(prisma.authUser.findMany).not.toHaveBeenCalled();
  });

  it("looks authors up once, for the members who typed something, and names them on their entries", async () => {
    const { prisma, caller } = world({
      entries: [entry("e1", { author_id: "m1" }), entry("e2", { author_id: "m1" }), entry("e3")],
      authors: [{ id: "m1", name: "Sam" }],
    });
    const rows = await caller.entry.list(range);
    expect(prisma.authUser.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.authUser.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1"] } },
      select: { id: true, name: true },
    });
    expect(rows.map((r) => r.author)).toEqual([{ name: "Sam" }, { name: "Sam" }, null]);
  });

  it("reads only the caller's own entries and projects", async () => {
    const { prisma, caller } = world({ entries: [entry("e1")] });
    await caller.entry.list(range);
    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user_id: "u1" }) }),
    );
    expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: "u1" } }));
  });

  it("never shows a half-built row: an entry whose project cannot be found is left out", async () => {
    const { caller } = world({ entries: [entry("e1"), entry("e2", { project_id: "gone" })] });
    expect((await caller.entry.list(range)).map((r) => r.id)).toEqual(["e1"]);
  });
});
