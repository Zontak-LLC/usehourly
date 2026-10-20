import { beforeEach, describe, expect, it } from "vitest";

import { needsFullResync, SYNC_RESYNC_AFTER_DAYS } from "@/lib/entry-sync";
import { pullEntries } from "@/server/entry-sync";

import { sqliteSyncDb } from "./helpers/sqlite-sync-db";

const DAY = 24 * 3600 * 1000;

describe("entry change log and pull (real SQLite, real migrations)", () => {
  let env: ReturnType<typeof sqliteSyncDb>;
  const sql = (q: string) => env.db.exec(q);
  const cursorAfterFullCopy = async (user: string) => (await pullEntries(env.prisma, user, { cursor: null })).head;

  beforeEach(() => {
    env = sqliteSyncDb();
    sql(`PRAGMA foreign_keys = OFF;
      INSERT INTO auth_users (id, email, password_hash, name) VALUES ('u1','a@x.test','x','A'), ('u2','b@x.test','x','B');
      INSERT INTO clients (id, user_id, name) VALUES ('c1','u1','Acme'), ('c2','u2','Other');
      INSERT INTO projects (id, user_id, client_id, name) VALUES ('p1','u1','c1','Site'), ('p2','u2','c2','Theirs');`);
  });

  const add = (id: string, user = "u1", project = "p1", date = "2026-10-20", minutes = 60) =>
    sql(`INSERT INTO time_entries (id, user_id, project_id, date, minutes, note, created_at, updated_at)
         VALUES ('${id}','${user}','${project}','${date}',${minutes},'', 0, 0)`);

  it("a first pull sends the whole copy; the next one sends only what changed, including deletes", async () => {
    add("e1");
    add("e2");
    const first = await pullEntries(env.prisma, "u1", { cursor: null });
    expect(first.full).toBe(true);
    expect(first.upserts.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(first.projects.map((p) => p.id)).toEqual(["p1"]);

    sql("UPDATE time_entries SET minutes = 90 WHERE id = 'e1'");
    sql("DELETE FROM time_entries WHERE id = 'e2'");
    add("e3");
    const next = await pullEntries(env.prisma, "u1", { cursor: first.head });
    expect(next.upserts.map((e) => [e.id, e.minutes]).sort()).toEqual([
      ["e1", 90],
      ["e3", 60],
    ]);
    expect(next.deletes).toEqual(["e2"]);
    expect(next.more).toBe(false);

    const quiet = await pullEntries(env.prisma, "u1", { cursor: next.head });
    expect(quiet.upserts).toEqual([]);
    expect(quiet.deletes).toEqual([]);
    expect(quiet.head).toBe(next.head); // nothing new: the cursor stays
  });

  it("a delete and a re-create of the same id arrives as one upsert, never as a delete", async () => {
    add("e1");
    const c = await cursorAfterFullCopy("u1");
    sql("DELETE FROM time_entries WHERE id = 'e1'");
    add("e1", "u1", "p1", "2026-10-21", 15);
    const next = await pullEntries(env.prisma, "u1", { cursor: c });
    expect(next.deletes).toEqual([]);
    expect(next.upserts).toMatchObject([{ id: "e1", date: "2026-10-21", minutes: 15 }]);
  });

  it("deleting a project (cascade) logs its entries as deleted", async () => {
    sql("PRAGMA foreign_keys = ON");
    add("e1");
    const c = await cursorAfterFullCopy("u1");
    sql("DELETE FROM projects WHERE id = 'p1'");
    const next = await pullEntries(env.prisma, "u1", { cursor: c });
    expect(next.deletes).toEqual(["e1"]);
  });

  it("never shows one account another's entries, changes or projects", async () => {
    add("mine");
    add("theirs", "u2", "p2");
    const c = await cursorAfterFullCopy("u1");
    sql("UPDATE time_entries SET minutes = 5 WHERE id = 'theirs'");
    add("theirs2", "u2", "p2");
    const full = await pullEntries(env.prisma, "u1", { cursor: null });
    expect(full.upserts.map((e) => e.id)).toEqual(["mine"]);
    expect(full.projects.map((p) => p.id)).toEqual(["p1"]);
    const delta = await pullEntries(env.prisma, "u1", { cursor: c });
    expect(delta.upserts).toEqual([]);
    expect(delta.deletes).toEqual([]);
  });

  it("a long backlog comes in pages that add up to everything, with no gaps", async () => {
    const c = await cursorAfterFullCopy("u1");
    for (let i = 0; i < 620; i++) add(`n${String(i).padStart(4, "0")}`);
    const seen = new Set<string>();
    let cursor = c;
    for (let guard = 0; guard < 10; guard++) {
      const page = await pullEntries(env.prisma, "u1", { cursor });
      for (const e of page.upserts) seen.add(e.id);
      cursor = page.head;
      if (!page.more) break;
    }
    expect(seen.size).toBe(620);
  });

  it("a full copy over several pages walks by id and reports the log position from before the first page", async () => {
    for (let i = 0; i < 1_050; i++) add(`f${String(i).padStart(4, "0")}`);
    const p1 = await pullEntries(env.prisma, "u1", { cursor: null });
    expect(p1.upserts).toHaveLength(1_000);
    expect(p1.more).toBe(true);
    add("zzz-late"); // changes while the copy is still being read
    const p2 = await pullEntries(env.prisma, "u1", { cursor: null, after: p1.nextAfter });
    expect(p2.more).toBe(false);
    const ids = new Set([...p1.upserts, ...p2.upserts].map((e) => e.id));
    expect(ids.size).toBeGreaterThanOrEqual(1_050);
    // Starting from the first page's position replays the late entry even if the second page missed it.
    const replay = await pullEntries(env.prisma, "u1", { cursor: p1.head });
    expect(replay.upserts.map((e) => e.id)).toContain("zzz-late");
  });

  it("a device away too long starts again from a full copy", () => {
    const now = Date.now();
    expect(needsFullResync(null, now)).toBe(true);
    expect(needsFullResync(now - (SYNC_RESYNC_AFTER_DAYS - 1) * DAY, now)).toBe(false);
    expect(needsFullResync(now - (SYNC_RESYNC_AFTER_DAYS + 1) * DAY, now)).toBe(true);
  });
});

describe("sync.pull as a procedure", () => {
  it("refuses a signed-out caller and answers a signed-in one with their own entries only", async () => {
    const { createCallerFactory } = await import("@/server/trpc");
    const { appRouter } = await import("@/server/routers/_app");
    const env = sqliteSyncDb();
    env.db.exec(`PRAGMA foreign_keys = OFF;
      INSERT INTO projects (id, user_id, client_id, name) VALUES ('p1','u1','c1','Site'), ('p2','u2','c2','Theirs');
      INSERT INTO time_entries (id, user_id, project_id, date, minutes, note, created_at, updated_at)
        VALUES ('mine','u1','p1','2026-10-20',30,'',0,0), ('theirs','u2','p2','2026-10-20',30,'',0,0);`);
    const as = (userId: string | null) =>
      createCallerFactory(appRouter)({
        session: userId ? { user: { id: userId }, expires: "" } : null,
        prisma: env.prisma as never,
      });
    await expect(as(null).sync.pull({ cursor: null })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(as("u1").sync.pull({ cursor: -1 })).rejects.toThrow(); // bad input is refused
    const mine = await as("u1").sync.pull({ cursor: null });
    expect(mine.upserts.map((e) => e.id)).toEqual(["mine"]);
  });
});
