import { describe, expect, it, vi } from "vitest";

import { invoicePeriodStart } from "@/lib/unbilled";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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
        { id: "p1", user_id: "u1", client_id: "c1", name: "Site", billable: true, hourly_rate: 10000 },
      ]),
    },
    client: { findMany: timed("clients", [{ id: "c1", user_id: "u1", name: "Acme", color: "#111" }]) },
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
  it("starts the entries, the projects, their clients and the non-billable days together, then joins them itself", async () => {
    const { caller, events } = world({ entries: [entry("e1")] });
    const rows = await caller.entry.list(range);
    // all four started before any finished: one round trip, not entries -> projects -> clients in a chain (a Prisma
    // `include` of the client would wait for the projects first)
    expect(events.slice(0, 4).sort()).toEqual(["start clients", "start days", "start entries", "start projects"]);
    expect(events.filter((e) => e.startsWith("start"))).toHaveLength(4);
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
    expect(prisma.client.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: "u1" } }));
  });

  it("the invoice builder asks for one client's entries only, still inside the account", async () => {
    const { prisma, caller } = world({ entries: [entry("e1")] });
    await caller.entry.list({ ...range, clientId: "c1" });
    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: "u1",
          date: { gte: range.from, lte: range.to },
          project: { client_id: "c1", user_id: "u1" },
        },
      }),
    );
    // without a client every entry in the range comes back, as before
    await caller.entry.list(range);
    expect(prisma.timeEntry.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { user_id: "u1", date: { gte: range.from, lte: range.to } } }),
    );
  });

  it("a client id that is not a plain id is refused before anything is read", async () => {
    const { prisma, caller } = world({ entries: [] });
    await expect(caller.entry.list({ ...range, clientId: "" })).rejects.toThrow();
    await expect(caller.entry.list({ ...range, clientId: "x".repeat(65) })).rejects.toThrow();
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it("never shows a half-built row: an entry whose project cannot be found is left out", async () => {
    const { caller } = world({ entries: [entry("e1"), entry("e2", { project_id: "gone" })] });
    expect((await caller.entry.list(range)).map((r) => r.id)).toEqual(["e1"]);
  });
});

describe("'not invoiced yet' costs one round of queries, and never reads the whole history", () => {
  function billWorld() {
    const events: string[] = [];
    const timed = <T>(label: string, rows: T) =>
      vi.fn(async (..._args: unknown[]) => {
        events.push(`start ${label}`);
        await new Promise((r) => setTimeout(r, 5));
        events.push(`end ${label}`);
        return rows;
      });
    const prisma = {
      timeEntry: {
        groupBy: timed("sums", [
          { project_id: "p1", _sum: { minutes: 240 }, _min: { date: "2026-10-01" }, _max: { date: "2026-10-20" } },
        ]),
        findMany: timed("off-day entries", [{ project_id: "p1", minutes: 60 }]),
      },
      project: { findMany: timed("projects", [{ id: "p1", client_id: "c1", billable: true, hourly_rate: 10000 }]) },
      nonBillableDay: { findMany: timed("days", [{ date: "2026-10-05" }]) },
    };
    const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
    return { prisma, caller, events };
  }

  it("starts the sums, the projects and the non-billable days together; off-day time is the only follow-up", async () => {
    const { caller, events } = billWorld();
    const rows = await caller.invoice.unbilled();
    expect(events.slice(0, 3).sort()).toEqual(["start days", "start projects", "start sums"]);
    expect(events.indexOf("start off-day entries")).toBeGreaterThan(events.indexOf("end days"));
    // 4 hours logged, 1 of them on a non-billable day: 3 hours at $100 are waiting to be billed
    expect(rows).toEqual([{ clientId: "c1", minutes: 180, cents: 30000, from: "2026-10-01", to: "2026-10-20" }]);
  });

  it("asks only for the caller's stopped, unbilled time", async () => {
    const { prisma, caller } = billWorld();
    await caller.invoice.unbilled();
    expect(prisma.timeEntry.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: "u1", invoice_id: null, started_at: null, minutes: { gt: 0 } } }),
    );
  });
});

describe("the invoice builder's default period", () => {
  it("starts at the client's oldest unbilled day, else the first of the month, never more than a year back", () => {
    expect(invoicePeriodStart("2026-10-24", "2026-08-03")).toBe("2026-08-03");
    expect(invoicePeriodStart("2026-10-24", undefined)).toBe("2026-10-01");
    expect(invoicePeriodStart("2026-10-24", "2026-10-24")).toBe("2026-10-01"); // only today: this month
    expect(invoicePeriodStart("2026-10-24", "2023-01-09")).toBe("2025-10-24"); // 366 days, today included
  });
});

/**
 * Migration 0038 on a real SQLite database with every migration applied: the "not invoiced yet" sum, in the exact SQL
 * Prisma sends, is answered from the partial index alone (only unbilled time), and gives the right answer.
 */
describe("the unbilled sum on a real database", () => {
  const SUM_SQL =
    "SELECT SUM(`main`.`time_entries`.`minutes`) AS `_sum$minutes`, MIN(`main`.`time_entries`.`date`) AS `_min$date`, MAX(`main`.`time_entries`.`date`) AS `_max$date`, `main`.`time_entries`.`project_id` FROM `main`.`time_entries` WHERE (`main`.`time_entries`.`user_id` = ? AND `main`.`time_entries`.`invoice_id` IS NULL AND `main`.`time_entries`.`started_at` IS NULL AND `main`.`time_entries`.`minutes` > ?) GROUP BY `main`.`time_entries`.`project_id` LIMIT ? OFFSET ?";

  function heavyAccount() {
    const db = new DatabaseSync(":memory:");
    const dir = path.join(process.cwd(), "migrations");
    const files = readdirSync(dir)
      .filter((n) => n.endsWith(".sql"))
      .sort();
    for (const f of files) db.exec(readFileSync(path.join(dir, f), "utf8"));
    db.exec(`INSERT INTO auth_users (id, email, password_hash) VALUES ('u1', 'jo@example.com', 'x'), ('u2', 'al@example.com', 'x');
      INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme'), ('c2', 'u2', 'Other');
      INSERT INTO projects (id, user_id, client_id, name) VALUES ('p1', 'u1', 'c1', 'Site'), ('p2', 'u2', 'c2', 'App');
      INSERT INTO invoices (id, user_id, client_id, client_name, number, issue_date, period_from, period_to, total_minutes,
        total_cents, snapshot, search_text) VALUES ('i1', 'u1', 'c1', 'Acme', 'INV-2024-001', '2024-01-01', '2023-01-01',
        '2023-12-31', 0, 0, '{}', '');`);
    const add = db.prepare(`INSERT INTO time_entries (id, user_id, project_id, date, minutes, invoice_id, started_at,
      created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '2026-01-01', '2026-01-01')`);
    // years of billed history, a little unbilled time, an empty entry, a running timer, and another account's time
    for (let i = 0; i < 900; i++) add.run(`b${i}`, "u1", "p1", `2024-0${(i % 9) + 1}-10`, 60, "i1", null);
    add.run("u-a", "u1", "p1", "2026-10-01", 90, null, null);
    add.run("u-b", "u1", "p1", "2026-10-20", 30, null, null);
    add.run("zero", "u1", "p1", "2026-10-21", 0, null, null);
    add.run("running", "u1", "p1", "2026-10-24", 5, null, "2026-10-24T09:00:00.000Z");
    add.run("theirs", "u2", "p2", "2026-10-02", 600, null, null);
    return db;
  }

  it("reads only the waiting time, from the index alone, and sums it right", () => {
    const db = heavyAccount();
    const plan = db
      .prepare(`EXPLAIN QUERY PLAN ${SUM_SQL}`)
      .all("u1", 0, 100, 0)
      .map((r) => String((r as { detail: string }).detail))
      .join("\n");
    expect(plan).toContain("COVERING INDEX time_entries_unbilled_idx");
    expect(db.prepare(SUM_SQL).all("u1", 0, 100, 0)).toEqual([
      { _sum$minutes: 120, _min$date: "2026-10-01", _max$date: "2026-10-20", project_id: "p1" },
    ]);
  });
});
