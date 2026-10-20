import type { PrismaClient } from "@prisma/client";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * A real SQLite database with every migration applied (so the sync triggers are the real ones), plus just enough of
 * Prisma's shape for `pullEntries`. Only the queries the pull makes are supported.
 */
export function sqliteSyncDb() {
  const db = new DatabaseSync(":memory:");
  const dir = path.join(process.cwd(), "migrations");
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  const all = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as Record<string, unknown>[];

  const prisma = {
    entryChange: {
      findFirst: async () => all("SELECT seq FROM entry_changes ORDER BY seq DESC LIMIT 1")[0] ?? null,
      findMany: async ({ where, take }: { where: { user_id: string; seq: { gt: number } }; take: number }) =>
        all(
          "SELECT * FROM entry_changes WHERE user_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?",
          where.user_id,
          where.seq.gt,
          take,
        ),
    },
    timeEntry: {
      findMany: async ({
        where,
        take,
      }: {
        where: { user_id: string; id?: { gt?: string; in?: string[] } };
        take?: number;
      }) => {
        const ids = where.id?.in;
        const rows = all(
          `SELECT * FROM time_entries WHERE user_id = ? ${where.id?.gt ? "AND id > ?" : ""} ORDER BY id ASC`,
          where.user_id,
          ...(where.id?.gt ? [where.id.gt] : []),
        );
        return rows.filter((r) => !ids || ids.includes(r.id as string)).slice(0, take ?? rows.length);
      },
    },
    project: {
      findMany: async ({ where }: { where: { user_id: string } }) =>
        all("SELECT * FROM projects WHERE user_id = ?", where.user_id),
    },
    nonBillableDay: {
      findMany: async ({ where }: { where: { user_id: string } }) =>
        all("SELECT date FROM non_billable_days WHERE user_id = ?", where.user_id),
    },
    authUser: { findMany: async () => [] },
  };
  return { db, prisma: prisma as unknown as PrismaClient };
}
