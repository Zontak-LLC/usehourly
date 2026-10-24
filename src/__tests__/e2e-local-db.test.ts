import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrationsApplied, runSql } from "../../e2e/local-db";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * The browser tests' fast path to their local database (issue 197): SQL goes straight into the D1 file Wrangler made,
 * and the migrations are skipped when every one is already applied. A wrong answer here would either test against a
 * database missing a table (migrations wrongly "applied") or slow every run down again.
 */
describe("browser tests: the local database helper", () => {
  let persist: string;
  let file: string;
  const migrations = readdirSync("migrations").filter((f) => f.endsWith(".sql"));

  beforeEach(() => {
    persist = mkdtempSync(join(tmpdir(), "e2e-db-"));
    const dir = join(persist, "v3", "d1", "miniflare-D1DatabaseObject");
    mkdirSync(dir, { recursive: true });
    // Wrangler keeps a metadata file beside the database; it must never be taken for the database.
    new DatabaseSync(join(dir, "metadata.sqlite")).close();
    file = join(dir, "0123abcd.sqlite");
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE);");
    db.close();
  });
  afterEach(() => rmSync(persist, { recursive: true, force: true }));

  const record = (names: string[]) =>
    runSql(names.map((n) => `INSERT INTO d1_migrations (name) VALUES ('${n}');`).join(" "), persist);

  it("a fresh test database (no folder yet) is migrated", () => {
    expect(migrationsApplied(join(persist, "nowhere"))).toBe(false);
  });

  it("is up to date only when every migration in migrations/ is recorded", () => {
    expect(migrationsApplied(persist)).toBe(false);
    record(migrations.slice(0, -1));
    expect(migrationsApplied(persist), "the newest migration is still missing").toBe(false);
    record(migrations.slice(-1));
    expect(migrationsApplied(persist)).toBe(true);
  });

  it("runs several statements in the database file itself, where the app reads them", () => {
    runSql(
      "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT); " +
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('support_notice', '{\"on\":true,\"cost\":25}');",
      persist,
    );
    const db = new DatabaseSync(file);
    expect(db.prepare("SELECT key, value FROM app_settings").all()).toEqual([
      { key: "support_notice", value: '{"on":true,"cost":25}' },
    ]);
    db.close();
  });

  it("a database without the migrations table counts as not migrated", () => {
    runSql("DROP TABLE d1_migrations;", persist);
    expect(migrationsApplied(persist)).toBe(false);
  });
});
