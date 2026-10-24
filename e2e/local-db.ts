import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * SQL against the browser tests' local database (issue 197). Opening the SQLite file directly takes a few milliseconds;
 * the old way, `npx wrangler d1 execute --local`, started Node, Wrangler and a workerd process for every statement (2 to
 * 5 seconds each, and the "chip in" spec, which runs alone while the other workers wait, made five of them).
 *
 * The file is the one Wrangler and the app use (`<persist>/v3/d1/miniflare-D1DatabaseObject/<id>.sqlite`); SQLite's own
 * locking makes a second process safe, exactly as it is for `wrangler d1 execute`. When the file cannot be found or
 * this Node has no built-in SQLite, it falls back to Wrangler.
 */
type Sqlite = {
  exec(sql: string): void;
  prepare(sql: string): { all(): Record<string, unknown>[] };
  close(): void;
};

function databaseFile(persist: string): string | null {
  const dir = join(persist, "v3", "d1", "miniflare-D1DatabaseObject");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
  // One D1 database is bound (DB); several files would mean an old one is lying around, so let Wrangler pick.
  return files.length === 1 ? join(dir, files[0]) : null;
}

function open(persist: string): Sqlite | null {
  const file = databaseFile(persist);
  const sqlite = process.getBuiltinModule?.("node:sqlite") as
    | { DatabaseSync: new (path: string) => Sqlite }
    | undefined;
  if (!file || !sqlite) return null;
  const db = new sqlite.DatabaseSync(file);
  // The app may be writing at the same moment: wait for its lock instead of failing with SQLITE_BUSY.
  db.exec("PRAGMA busy_timeout = 10000;");
  return db;
}

function viaWrangler(persist: string | undefined, statements: string) {
  const where = persist ? ["--persist-to", persist] : [];
  // Several workers share one local database file with the app, so it can be locked for a moment ("database is locked",
  // SQLITE_BUSY). Wait a little and try again instead of failing the test.
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", ...where, "--command", statements], {
        stdio: "pipe",
      });
      return;
    } catch (err) {
      const text = `${(err as { stderr?: Buffer }).stderr ?? ""}${(err as Error).message}`;
      if (attempt >= 6 || !/SQLITE_BUSY|database is locked/i.test(text)) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400 * attempt);
    }
  }
}

/** Runs one or more statements against the test database. */
export function runSql(statements: string, persist = process.env.E2E_PERSIST) {
  const db = persist ? open(persist) : null;
  if (!db) return viaWrangler(persist, statements);
  try {
    db.exec(statements);
  } finally {
    db.close();
  }
}

/** True when every migration in migrations/ is already applied to the test database (so applying them can be skipped). */
export function migrationsApplied(persist: string): boolean {
  const db = open(persist);
  if (!db) return false;
  try {
    const done = new Set(
      db
        .prepare("SELECT name FROM d1_migrations")
        .all()
        .map((r) => String(r.name)),
    );
    return readdirSync("migrations")
      .filter((f) => f.endsWith(".sql"))
      .every((f) => done.has(f));
  } catch {
    return false; // no d1_migrations table yet: a fresh database
  } finally {
    db.close();
  }
}
