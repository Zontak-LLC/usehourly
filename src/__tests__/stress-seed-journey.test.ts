import { describe, expect, it } from "vitest";

import {
  CLEANUP_STEP,
  emailFor,
  planFiles,
  ROWS_PER_INSERT,
  seedSql,
  userId,
  weekdaysBefore,
} from "../../scripts/stress/seed.mjs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// The stress-test seed (issue 180) runs on a real database, so it is checked on one: a SQLite file with every
// migration applied, its triggers and foreign keys included, exactly as D1 has them.
function migratedDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const dir = path.join(process.cwd(), "migrations");
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  return db;
}
const count = (db: DatabaseSync, sql: string) => Number((db.prepare(sql).get() as { n: number }).n);

const opts = { entries: 40, today: "2026-10-23", passwordHash: "$2a$10$not-a-real-hash" };

describe("stress test: filling staging with many accounts and removing them again", () => {
  it("adds accounts with their clients, projects and time, and removes exactly them afterwards", () => {
    const db = migratedDb();
    // A real person's account that must survive the clean-up untouched.
    db.exec(`INSERT INTO auth_users (id,name,email,password_hash) VALUES ('real-1','Real','stress-fan@example.com','x');
      INSERT INTO clients (id,user_id,name) VALUES ('real-c','real-1','Acme');
      INSERT INTO projects (id,user_id,client_id,name) VALUES ('real-p','real-1','real-c','Web');
      INSERT INTO time_entries (id,user_id,project_id,date,minutes,updated_at) VALUES ('real-e','real-1','real-p','2026-10-20',60,'2026-10-20');`);

    const files = planFiles({ accounts: 120, perFile: 50, ...opts });
    for (const f of files.filter((x) => x.name.startsWith("seed-"))) db.exec(f.sql);

    expect(count(db, "SELECT COUNT(*) n FROM auth_users WHERE email LIKE 'stress-%@stress.invalid'")).toBe(120);
    expect(count(db, "SELECT COUNT(*) n FROM clients WHERE user_id LIKE 'stress-u-%'")).toBe(360);
    expect(count(db, "SELECT COUNT(*) n FROM projects WHERE user_id LIKE 'stress-u-%'")).toBe(600);
    expect(count(db, "SELECT COUNT(*) n FROM time_entries WHERE user_id LIKE 'stress-u-%'")).toBe(120 * 40);
    // The sync trigger logged every insert: the clean-up must remove these too.
    expect(count(db, "SELECT COUNT(*) n FROM entry_changes WHERE user_id LIKE 'stress-u-%'")).toBe(120 * 40);
    // Every entry sits on its own account's project, on a weekday.
    expect(
      count(
        db,
        "SELECT COUNT(*) n FROM time_entries e JOIN projects p ON p.id = e.project_id WHERE e.user_id LIKE 'stress-u-%' AND p.user_id <> e.user_id",
      ),
    ).toBe(0);
    const days = (
      db.prepare("SELECT DISTINCT date FROM time_entries WHERE user_id LIKE 'stress-u-%'").all() as {
        date: string;
      }[]
    ).map((r) => new Date(`${r.date}T12:00:00Z`).getUTCDay());
    expect(days.every((d) => d !== 0 && d !== 6)).toBe(true);

    // The load run itself adds more (an entry on a seeded account, an account it registered).
    db.exec(`INSERT INTO time_entries (id,user_id,project_id,date,minutes,updated_at)
        VALUES ('made-by-run','stress-u-00007','stress-p-00007-0','2026-10-23',30,'2026-10-23');
      INSERT INTO auth_users (id,name,email,password_hash) VALUES ('run-1','x','stress-new01@stress.invalid','x');
      INSERT INTO clients (id,user_id,name) VALUES ('run-c','run-1','C');
      INSERT INTO projects (id,user_id,client_id,name) VALUES ('run-p','run-1','run-c','P');
      INSERT INTO time_entries (id,user_id,project_id,date,minutes,updated_at) VALUES ('run-e','run-1','run-p','2026-10-23',15,'2026-10-23');`);

    for (const f of files.filter((x) => x.name.startsWith("cleanup-"))) db.exec(f.sql);

    expect(count(db, "SELECT COUNT(*) n FROM auth_users WHERE email LIKE '%stress.invalid'")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM time_entries")).toBe(1);
    expect(count(db, "SELECT COUNT(*) n FROM clients")).toBe(1);
    expect(count(db, "SELECT COUNT(*) n FROM projects")).toBe(1);
    expect(count(db, "SELECT COUNT(*) n FROM entry_changes WHERE user_id <> 'real-1'")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM auth_users WHERE id = 'real-1'")).toBe(1);
    expect(count(db, "SELECT COUNT(*) n FROM entry_changes WHERE user_id = 'real-1'")).toBe(1);
  });

  it("keeps every INSERT under D1's 100 KB statement limit and the clean-up in small steps", () => {
    const sql = seedSql(1, 20, { ...opts, entries: 200 });
    const statements = sql.split(";\nINSERT").map((s) => s.length);
    expect(Math.max(...statements)).toBeLessThan(100_000);
    expect(ROWS_PER_INSERT).toBeLessThanOrEqual(400);
    const files = planFiles({ accounts: 1000, perFile: 250, ...opts });
    expect(files.filter((f) => f.name.startsWith("seed-"))).toHaveLength(4);
    expect(files.filter((f) => f.name.startsWith("cleanup-"))).toHaveLength(1000 / CLEANUP_STEP + 1);
    // File names sort in the order they must run.
    const names = files.map((f) => f.name);
    expect(names.filter((n) => n.startsWith("cleanup-"))).toEqual(names.filter((n) => n.startsWith("cleanup-")).sort());
  });

  it("makes the same data on every run and names every account so it can be found", () => {
    expect(seedSql(3, 4, opts)).toBe(seedSql(3, 4, opts));
    expect(userId(42)).toBe("stress-u-00042");
    expect(emailFor(42)).toBe("stress-00042@stress.invalid");
    const days = weekdaysBefore("2026-10-23", 7);
    expect(days).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(() => weekdaysBefore("23/10/2026", 7)).toThrow();
  });
});
