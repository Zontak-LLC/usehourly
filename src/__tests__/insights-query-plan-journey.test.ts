import { describe, expect, it } from "vitest";

import { ACCOUNT_ACTIVITY_SQL, accountActivityArgs, dbStamp } from "@/server/insights-activity";

import { seedFiles } from "../../scripts/stress/seed.mjs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Issue 180: with 10,000 accounts and 2.6 million entries on staging, Insights took 2.9 s (four scans of every entry)
// and the hourly overdue-reminder query read every invoice, snapshot included. Migration 0040 adds the indexes that
// turn both into short seeks. These scenarios check the plans and the answers on a real SQLite database with every
// migration applied, filled by the stress seed (a realistic mix of accounts, invoices included).
const NOW = new Date("2026-10-24T15:00:00Z");

function filledDb() {
  const db = new DatabaseSync(":memory:");
  const dir = path.join(process.cwd(), "migrations");
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  for (const f of seedFiles({ accounts: 100, today: "2026-10-24", passwordHash: "x", seed: 20261023 })) db.exec(f.sql);
  // Recent activity: one account made an entry yesterday, another only edited an old one this week, a sample account
  // logged today (it must never count), and one entry is stamped in SQLite's own CURRENT_TIMESTAMP form.
  const stamp = (days: number) => dbStamp(new Date(NOW.getTime() - days * 86_400_000));
  db.exec(`INSERT INTO time_entries (id,user_id,project_id,date,minutes,created_at,updated_at)
      VALUES ('new-1','stress-u-00003','stress-p-00003-0','2026-10-23',60,'${stamp(1)}','${stamp(1)}');
    UPDATE time_entries SET updated_at = '${stamp(2)}' WHERE id = 'stress-e-00001-0000';
    INSERT INTO auth_users (id,email,password_hash,is_demo,created_at) VALUES ('demo-1','d@demo.invalid','x',1,'${stamp(0)}');
    INSERT INTO clients (id,user_id,name) VALUES ('demo-c','demo-1','C');
    INSERT INTO projects (id,user_id,client_id,name) VALUES ('demo-p','demo-1','demo-c','P');
    INSERT INTO time_entries (id,user_id,project_id,date,minutes,created_at,updated_at)
      VALUES ('demo-e','demo-1','demo-p','2026-10-24',30,'${stamp(0)}','${stamp(0)}');
    INSERT INTO auth_users (id,email,password_hash,created_at) VALUES ('plain-1','p@example.com','x','2026-10-20 08:00:00');
    INSERT INTO clients (id,user_id,name) VALUES ('plain-c','plain-1','C');
    INSERT INTO projects (id,user_id,client_id,name) VALUES ('plain-p','plain-1','plain-c','P');
    INSERT INTO time_entries (id,user_id,project_id,date,minutes,created_at,updated_at)
      VALUES ('plain-e','plain-1','plain-p','2026-10-20',30,'2026-10-20 09:00:00','2026-10-20 09:00:00');`);
  return db;
}

const planOf = (db: DatabaseSync, sql: string, args: (string | number)[]) =>
  (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as { detail: string }[]).map((r) => r.detail);

type Activity = { user_id: string; first: string | null; created30: number; active7: number; active30: number };

describe("Insights and the reminder run stay fast with many accounts", () => {
  it("answers each account's questions with one seek in an index, never a scan of every entry", () => {
    const db = filledDb();
    const args = accountActivityArgs(NOW, 20_000);
    const plan = planOf(db, ACCOUNT_ACTIVITY_SQL, args);
    const entryReads = plan.filter((p) => / (e|time_entries) /.test(p) && !p.includes("SUBQUERY"));
    expect(entryReads).toHaveLength(4);
    expect(
      entryReads.filter((p) => p.includes("COVERING INDEX time_entries_user_created_idx (user_id=?")),
    ).toHaveLength(2);
    expect(
      entryReads.filter((p) => p.includes("COVERING INDEX time_entries_user_updated_idx (user_id=? AND updated_at>?)")),
    ).toHaveLength(2);
    expect(plan.join("\n")).not.toMatch(/SCAN (e|time_entries)\b/);
  });

  it("gives the same answers as counting every entry did", () => {
    const db = filledDb();
    const [since30, since7] = accountActivityArgs(NOW, 20_000) as string[];
    const got = db.prepare(ACCOUNT_ACTIVITY_SQL).all(...accountActivityArgs(NOW, 20_000)) as Activity[];
    // The old way: whole-table group-bys, real accounts only.
    const real = new Set(
      (db.prepare("SELECT id FROM auth_users WHERE is_demo = 0").all() as { id: string }[]).map((r) => r.id),
    );
    const first = new Map(
      (
        db.prepare("SELECT user_id, MIN(created_at) first FROM time_entries GROUP BY user_id").all() as {
          user_id: string;
          first: string;
        }[]
      ).map((r) => [r.user_id, r.first]),
    );
    const n30 = new Map(
      (
        db
          .prepare("SELECT user_id, COUNT(*) n FROM time_entries WHERE created_at >= ? GROUP BY user_id")
          .all(since30) as {
          user_id: string;
          n: number;
        }[]
      ).map((r) => [r.user_id, r.n]),
    );
    const activeSince = (since: string) =>
      new Set(
        (
          db.prepare("SELECT DISTINCT user_id FROM time_entries WHERE updated_at >= ?").all(since) as {
            user_id: string;
          }[]
        ).map((r) => r.user_id),
      );
    const a7 = activeSince(since7);
    const a30 = activeSince(since30);

    expect(got.map((r) => r.user_id).sort()).toEqual([...real].sort());
    for (const r of got) {
      expect(r.first).toBe(first.get(r.user_id) ?? null);
      expect(r.created30).toBe(n30.get(r.user_id) ?? 0);
      expect(r.active7).toBe(a7.has(r.user_id) ? 1 : 0);
      expect(r.active30).toBe(a30.has(r.user_id) ? 1 : 0);
    }
    const by = (id: string) => got.find((r) => r.user_id === id);
    expect(by("stress-u-00003")).toMatchObject({ active7: 1, active30: 1 });
    expect(by("stress-u-00003")?.created30).toBeGreaterThan(0);
    expect(by("stress-u-00001")).toMatchObject({ active7: 1, created30: 0 }); // an edit counts as activity
    expect(by("demo-1")).toBeUndefined();
    expect(by("plain-1")).toMatchObject({ first: "2026-10-20 09:00:00", active7: 1 }); // SQLite's own form sorts right
  });

  it("finds overdue invoices that may need a reminder from the partial index alone, without reading a snapshot", () => {
    const db = filledDb();
    // The seed's overdue invoices have had both reminders by now; two get one more chance to be due.
    db.exec(`UPDATE invoices SET reminders_sent = 0 WHERE id IN (SELECT id FROM invoices
      WHERE remind_overdue = 1 AND paid_date IS NULL ORDER BY id LIMIT 2)`);
    // The query Prisma sends for server/invoice-reminders.ts, with its values bound the same way.
    const sql = `SELECT "id", "user_id", "due_date", "paid_date", "reminders_sent" FROM "invoices"
      WHERE ("remind_overdue" = ? AND "paid_date" IS NULL AND "due_date" < ? AND "reminders_sent" < ?)
      ORDER BY "id" ASC LIMIT ? OFFSET ?`;
    const args = [1, "2026-10-24", 2, 200, 0];
    const plan = planOf(db, sql, args).join("\n");
    expect(plan).toContain("COVERING INDEX invoices_overdue_idx");
    expect(plan).not.toMatch(/TEMP B-TREE/);

    // Same rows as reading every invoice; only the two still due, not the ones already reminded twice.
    const all = db.prepare(sql.replace('FROM "invoices"', 'FROM "invoices" NOT INDEXED')).all(...args);
    expect(db.prepare(sql).all(...args)).toEqual(all);
    expect(all).toHaveLength(2);
    const done = db
      .prepare(`SELECT COUNT(*) n FROM invoices WHERE remind_overdue = 1 AND paid_date IS NULL AND reminders_sent = 2`)
      .get() as { n: number };
    expect(done.n).toBeGreaterThan(0);
  });
});
