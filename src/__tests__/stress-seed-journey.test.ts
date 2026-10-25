import { describe, expect, it } from "vitest";

import { buildInvoice, type InvoiceSnapshot } from "@/lib/invoice";
import { invoiceFromSnapshot } from "@/lib/invoice-list";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

import { refusal } from "../../scripts/stress/recreate-staging.mjs";
import {
  CLEANUP_STEP,
  cleanupFiles,
  emailFor,
  expectedCounts,
  MAX_STATEMENT_CHARS,
  profileOf,
  seedFiles,
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
const rows = <T>(db: DatabaseSync, sql: string) => db.prepare(sql).all() as T[];

const opts = { today: "2026-10-24", passwordHash: "$2a$10$not-a-real-hash", seed: 20261023 };
const seedAll = (db: DatabaseSync, accounts: number, maxBytes?: number) => {
  const files = [...seedFiles({ accounts, maxBytes, ...opts })];
  for (const f of files) db.exec(f.sql);
  return files;
};

describe("stress test: filling staging with a realistic mix of accounts and removing them again", () => {
  it("makes exactly 60% tried-it, 30% light, 9% regular and 1% heavy accounts, shaped like real ones", () => {
    const db = migratedDb();
    seedAll(db, 200);
    const counts = expectedCounts({ accounts: 200, ...opts });
    expect(counts).toMatchObject({ accounts: 200, tried: 120, light: 60, regular: 18, heavy: 2 });

    // Every row the seed counted is in the database (nothing silently ignored), and the trigger logged every entry.
    expect(count(db, "SELECT COUNT(*) n FROM auth_users")).toBe(200);
    expect(count(db, "SELECT COUNT(*) n FROM clients")).toBe(counts.clients);
    expect(count(db, "SELECT COUNT(*) n FROM projects")).toBe(counts.projects);
    expect(count(db, "SELECT COUNT(*) n FROM invoices")).toBe(counts.invoices);
    expect(count(db, "SELECT COUNT(*) n FROM non_billable_days")).toBe(counts.nonBillableDays);
    expect(count(db, "SELECT COUNT(*) n FROM time_entries")).toBe(counts.entries);
    expect(count(db, "SELECT COUNT(*) n FROM time_entries WHERE invoice_id IS NOT NULL")).toBe(counts.billedEntries);
    expect(count(db, "SELECT COUNT(*) n FROM entry_changes")).toBe(counts.entries);

    type Shape = { id: string; clients: number; projects: number; entries: number; invoices: number; years: number };
    const shapes = rows<Shape>(
      db,
      `SELECT u.id,
        (SELECT COUNT(*) FROM clients c WHERE c.user_id = u.id) clients,
        (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) projects,
        (SELECT COUNT(*) FROM time_entries e WHERE e.user_id = u.id) entries,
        (SELECT COUNT(*) FROM invoices i WHERE i.user_id = u.id) invoices,
        (SELECT (julianday(MAX(date)) - julianday(MIN(date))) / 365.0 FROM time_entries e WHERE e.user_id = u.id) years
       FROM auth_users u`,
    );
    const of = (kind: string) => shapes.filter((s) => profileOf(Number(s.id.slice(-5)), opts.seed) === kind);
    for (const s of of("tried")) {
      expect(s).toMatchObject({ clients: 1, projects: 1, invoices: 0 });
      expect(s.entries).toBeLessThanOrEqual(10);
    }
    for (const s of of("light")) {
      expect([2, 3]).toContain(s.clients);
      expect(s.entries).toBeGreaterThanOrEqual(100);
      expect(s.entries).toBeLessThanOrEqual(300);
      expect(s.invoices).toBe(0);
    }
    for (const s of of("regular")) {
      expect(s.clients).toBeGreaterThanOrEqual(3);
      expect(s.clients).toBeLessThanOrEqual(6);
      expect(s.entries).toBeGreaterThanOrEqual(1300);
      expect(s.entries).toBeLessThanOrEqual(1700);
      expect(s.years).toBeGreaterThan(0.9);
      expect(s.invoices).toBeGreaterThan(10);
    }
    for (const s of of("heavy")) {
      expect(s.clients).toBeGreaterThanOrEqual(8);
      expect(s.projects).toBeGreaterThanOrEqual(20);
      expect(s.projects).toBeLessThanOrEqual(40);
      expect(s.entries).toBeGreaterThanOrEqual(5500);
      expect(s.years).toBeGreaterThan(4.9);
      expect(s.invoices).toBeGreaterThan(200);
      expect(s.invoices).toBeLessThan(450);
    }

    // Time is mostly on weekdays, from 15 minutes to 8 hours, and never in the future.
    const weekend = count(db, "SELECT COUNT(*) n FROM time_entries WHERE strftime('%w', date) IN ('0','6')");
    expect(weekend / counts.entries).toBeLessThan(0.05);
    expect(weekend).toBeGreaterThan(0);
    expect(count(db, "SELECT COUNT(*) n FROM time_entries WHERE minutes < 15 OR minutes > 480")).toBe(0);
    expect(count(db, `SELECT COUNT(*) n FROM time_entries WHERE date > '${opts.today}'`)).toBe(0);
    // Every entry sits on its own account's project.
    expect(
      count(
        db,
        "SELECT COUNT(*) n FROM time_entries e JOIN projects p ON p.id = e.project_id WHERE p.user_id <> e.user_id",
      ),
    ).toBe(0);
    // Seeding 200 accounts can pass 5 s when several builds share the machine.
  }, 30000);

  it("stores invoices the app can read: the same snapshot, PDF and list row as invoice.create's, billing each hour once", async () => {
    const db = migratedDb();
    seedAll(db, 100);
    type Row = { id: string; snapshot: string; total_cents: number; total_minutes: number; paid_date: string | null };
    const invoices = rows<Row>(db, "SELECT id, snapshot, total_cents, total_minutes, paid_date FROM invoices");
    expect(invoices.length).toBeGreaterThan(300);

    // The billed time of each invoice adds up to its total, priced again by the app's own math.
    type Billed = { date: string; minutes: number; note: string; project_id: string; name: string; rate: number };
    for (const inv of invoices.filter((_, k) => k % 25 === 0)) {
      const s = JSON.parse(inv.snapshot) as InvoiceSnapshot;
      const billed = rows<Billed>(
        db,
        `SELECT e.date, e.minutes, e.note, e.project_id, p.name, p.hourly_rate rate
         FROM time_entries e JOIN projects p ON p.id = e.project_id WHERE e.invoice_id = '${inv.id}'`,
      );
      const again = buildInvoice(
        billed.map((b) => ({
          date: b.date,
          minutes: b.minutes,
          note: b.note,
          started_at: null,
          project_id: b.project_id,
          project: { name: b.name, hourly_rate: b.rate, billable: true },
        })),
      );
      expect(again.lines).toEqual(s.lines);
      expect(again.totalCents).toBe(inv.total_cents);
      expect(s.totalCents).toBe(inv.total_cents);
      expect(s.totalMinutes).toBe(inv.total_minutes);
      expect(billed.every((b) => b.date >= s.periodFrom && b.date <= s.periodTo)).toBe(true);
      expect(invoiceFromSnapshot(inv.id, s, inv.paid_date)).toMatchObject({
        number: s.number,
        total_cents: inv.total_cents,
        currency: "USD",
        paid_date: inv.paid_date,
      });
    }
    const first = JSON.parse(invoices[0].snapshot) as InvoiceSnapshot;
    const pdf = await buildInvoicePdf(first);
    expect(new TextDecoder().decode(new Uint8Array(pdf.output("arraybuffer")).slice(0, 5))).toBe("%PDF-");
    expect(pdf.output()).toContain(first.number);

    // Never on an internal (non-billable) project or a day marked non-billable; numbers are unique per account.
    expect(
      count(
        db,
        "SELECT COUNT(*) n FROM time_entries e JOIN projects p ON p.id = e.project_id WHERE e.invoice_id IS NOT NULL AND p.billable = 0",
      ),
    ).toBe(0);
    expect(
      count(
        db,
        "SELECT COUNT(*) n FROM time_entries e JOIN non_billable_days d ON d.user_id = e.user_id AND d.date = e.date WHERE e.invoice_id IS NOT NULL",
      ),
    ).toBe(0);
    // Most older invoices are paid, a paid date never comes before the invoice or after today.
    expect(count(db, "SELECT COUNT(*) n FROM invoices WHERE paid_date IS NOT NULL")).toBeGreaterThan(
      invoices.length / 2,
    );
    expect(
      count(db, `SELECT COUNT(*) n FROM invoices WHERE paid_date < issue_date OR paid_date > '${opts.today}'`),
    ).toBe(0);
  });

  it("names every row with the stress prefix, and the clean-up removes exactly those rows", () => {
    const db = migratedDb();
    // A real person's account that must survive the clean-up untouched.
    db.exec(`INSERT INTO auth_users (id,name,email,password_hash) VALUES ('real-1','Real','stress-fan@example.com','x');
      INSERT INTO clients (id,user_id,name) VALUES ('real-c','real-1','Acme');
      INSERT INTO projects (id,user_id,client_id,name) VALUES ('real-p','real-1','real-c','Web');
      INSERT INTO time_entries (id,user_id,project_id,date,minutes,updated_at) VALUES ('real-e','real-1','real-p','2026-10-20',60,'2026-10-20');`);
    const files = seedAll(db, 120, 2_000_000);
    expect(files.length).toBeGreaterThan(1); // split by size, whole accounts per file

    const off = (table: string, col: string, prefix: string) =>
      count(db, `SELECT COUNT(*) n FROM ${table} WHERE ${col} NOT LIKE '${prefix}%' AND user_id <> 'real-1'`);
    expect(count(db, "SELECT COUNT(*) n FROM auth_users WHERE id <> 'real-1' AND id NOT LIKE 'stress-u-%'")).toBe(0);
    expect(
      count(
        db,
        "SELECT COUNT(*) n FROM auth_users WHERE id LIKE 'stress-u-%' AND email NOT LIKE 'stress-%@stress.invalid'",
      ),
    ).toBe(0);
    expect(off("clients", "id", "stress-c-")).toBe(0);
    expect(off("projects", "id", "stress-p-")).toBe(0);
    expect(off("invoices", "id", "stress-i-")).toBe(0);
    expect(off("time_entries", "id", "stress-e-")).toBe(0);
    expect(off("non_billable_days", "user_id", "stress-u-")).toBe(0);
    // Client email addresses are on the reserved .invalid domain too: nothing can be sent to them.
    expect(count(db, "SELECT COUNT(*) n FROM clients WHERE email IS NOT NULL AND email NOT LIKE '%.invalid'")).toBe(0);

    // Running a file twice (a retry after a failed upload) adds nothing.
    const before = count(db, "SELECT COUNT(*) n FROM time_entries");
    db.exec(files[0].sql);
    expect(count(db, "SELECT COUNT(*) n FROM time_entries")).toBe(before);

    // The load run itself adds more (an entry on a seeded account, an account it registered).
    db.exec(`INSERT INTO time_entries (id,user_id,project_id,date,minutes,updated_at)
        VALUES ('made-by-run','stress-u-00007','stress-p-00007-0','2026-10-23',30,'2026-10-23');
      INSERT INTO auth_users (id,name,email,password_hash) VALUES ('run-1','x','stress-new01@stress.invalid','x');
      INSERT INTO clients (id,user_id,name) VALUES ('run-c','run-1','C');
      INSERT INTO projects (id,user_id,client_id,name) VALUES ('run-p','run-1','run-c','P');
      INSERT INTO time_entries (id,user_id,project_id,date,minutes,updated_at) VALUES ('run-e','run-1','run-p','2026-10-23',15,'2026-10-23');`);

    for (const f of cleanupFiles(120)) db.exec(f.sql);

    expect(count(db, "SELECT COUNT(*) n FROM auth_users WHERE email LIKE '%stress.invalid'")).toBe(0);
    for (const table of ["time_entries", "clients", "projects", "auth_users"]) {
      expect(count(db, `SELECT COUNT(*) n FROM ${table}`)).toBe(1);
    }
    expect(count(db, "SELECT COUNT(*) n FROM invoices")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM non_billable_days")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM entry_changes WHERE user_id <> 'real-1'")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM entry_changes WHERE user_id = 'real-1'")).toBe(1);
  });

  it("keeps every statement under D1's 100 KB limit and the clean-up in small, ordered steps", () => {
    const statements = seedSql(1, 100, opts).split(/;\n(?=INSERT)/);
    expect(Math.max(...statements.map((s) => s.length))).toBeLessThanOrEqual(MAX_STATEMENT_CHARS + 1);
    expect(MAX_STATEMENT_CHARS).toBeLessThan(100_000);
    const files = cleanupFiles(1000);
    expect(files).toHaveLength(1000 / CLEANUP_STEP + 1);
    const names = files.map((f) => f.name);
    expect(names).toEqual([...names].sort());
  });

  it("makes the same data on every run, and other data for another seed", () => {
    expect(seedSql(3, 4, opts)).toBe(seedSql(3, 4, opts));
    expect(seedSql(3, 4, { ...opts, seed: 7 })).not.toBe(seedSql(3, 4, opts));
    expect(userId(42)).toBe("stress-u-00042");
    expect(emailFor(42)).toBe("stress-00042@stress.invalid");
    const days = weekdaysBefore("2026-10-23", 7);
    expect(days).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(() => weekdaysBefore("23/10/2026", 7)).toThrow();
  });

  it("recreates only the staging database: any other config is refused", () => {
    const staging = (name: string, id = "df342815-d477-4367-9c4a-07709a0e54e1", worker = "hourly-staging") =>
      `{ "name": "${worker}", "d1_databases": [ { "binding": "DB", "database_name": "${name}", "database_id": "${id}" } ] }`;
    const prod = `{ "name": "hourly", "d1_databases": [ { "binding": "DB", "database_name": "hourly-db", "database_id": "11111111-2222-4333-8444-555555555555" } ] }`;
    expect(refusal(staging("hourly-staging-db"), prod)).toBeNull();
    expect(refusal(staging("hourly-db"), prod)).toMatch(/not hourly-staging-db/);
    expect(refusal(staging("hourly-staging-db", "11111111-2222-4333-8444-555555555555"), prod)).toMatch(/production/);
    expect(refusal(staging("hourly-staging-db", "x"), prod)).toMatch(/no real database id/);
    expect(refusal(staging("hourly-staging-db", undefined, "hourly"), prod)).toMatch(/not the hourly-staging Worker/);
    const two = `{ "name": "hourly-staging", "d1_databases": [ { "binding": "X", "database_name": "hourly-staging-db" }, { "binding": "DB", "database_name": "hourly-db" } ] }`;
    expect(refusal(two, prod)).toMatch(/exactly one/);
  });
});
