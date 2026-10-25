import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** An in-memory SQLite database with every migration in migrations/ applied, in order. */
export function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  const dir = path.join(process.cwd(), "migrations");
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(path.join(dir, f), "utf8"));
  return db;
}

/**
 * A stand-in D1 binding over a migrated node:sqlite database, for the REAL Prisma client and D1 adapter
 * (`new PrismaClient({ adapter: new PrismaD1(DB) })`). Every query answers after 5 ms, like a round trip, so concurrent
 * requests interleave between statements as they do on D1 (which runs one statement at a time).
 *
 * `requester` (optional) names the request a query is sent from. Like workerd, a query sent from a canceled request
 * never settles, and one canceled while it was out never answers.
 */
export function fakeD1<R extends { canceled: boolean }>(requester: () => R | undefined = () => undefined) {
  const db = migratedDb();
  const sent: { sql: string; by: R | undefined }[] = [];
  const io = <T>(work: () => T): Promise<T> => {
    const by = requester();
    if (by?.canceled) return new Promise<T>(() => undefined);
    return new Promise<T>((resolve, reject) =>
      setTimeout(() => {
        if (by?.canceled) return; // canceled while the query was out
        try {
          resolve(work());
        } catch (err) {
          reject(err);
        }
      }, 5),
    );
  };
  const DB = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        raw() {
          sent.push({ sql, by: requester() });
          return io(() => {
            // column names from the first row: StatementSync.columns() needs Node 22.16+, CI runs 22.14
            const objects = db.prepare(sql).all(...(args as never[]));
            return [Object.keys(objects[0] ?? {}), ...objects.map((row) => Object.values(row))];
          });
        },
        run() {
          // Like D1, `changes` includes rows written by triggers (an entry insert also logs to entry_changes, so D1
          // reports 2). node:sqlite's own `changes` leaves them out, which hid a bug once (PR #335).
          return io(() => {
            const before = Number(db.prepare("SELECT total_changes() AS n").get()?.n);
            db.prepare(sql).run(...(args as never[]));
            return { meta: { changes: Number(db.prepare("SELECT total_changes() AS n").get()?.n) - before } };
          });
        },
      };
      return stmt;
    },
    exec: (sql: string) => io(() => db.exec(sql)),
  };
  return { db, DB, sent };
}
