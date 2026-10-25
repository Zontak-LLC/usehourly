import type { PrismaClient } from "@prisma/client";

/**
 * What Insights needs to know about each real account's time: when its first entry was made, how many it made in the
 * last 30 days, and whether it made or changed one in the last 7 and 30 days. Asked per account, so every question is
 * one short seek in time_entries_user_created_idx or time_entries_user_updated_idx (migration 0040) and the cost
 * follows the number of accounts, not the number of entries (four scans of every entry took 2.9 s at 2.6 million).
 * The SQL is exported so a test checks its query plan on a real SQLite database.
 */
export const ACCOUNT_ACTIVITY_SQL = `SELECT u.id AS user_id,
  (SELECT MIN(e.created_at) FROM time_entries e WHERE e.user_id = u.id) AS first,
  (SELECT COUNT(*) FROM time_entries e WHERE e.user_id = u.id AND e.created_at >= ?) AS created30,
  EXISTS (SELECT 1 FROM time_entries e WHERE e.user_id = u.id AND e.updated_at >= ?) AS active7,
  EXISTS (SELECT 1 FROM time_entries e WHERE e.user_id = u.id AND e.updated_at >= ?) AS active30
FROM auth_users u WHERE u.is_demo = 0 ORDER BY u.id LIMIT ?`;

export type AccountActivityRow = {
  user_id: string;
  /** Prisma's D1 driver turns timestamp-looking text into a Date; node:sqlite and older drivers give the text. */
  first: string | Date | null;
  created30: number | bigint;
  active7: number | bigint;
  active30: number | bigint;
};

/** A timestamp as Prisma writes it in SQLite ("2026-10-24T09:00:00.000+00:00"), so text comparison orders it right. */
export const dbStamp = (d: Date) => d.toISOString().replace("Z", "+00:00");

/** A stored timestamp back as a Date: Prisma's form, or SQLite's CURRENT_TIMESTAMP form (UTC, no zone). */
export function fromDbStamp(s: string | Date): Date {
  if (s instanceof Date) return s;
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(" ", "T")}Z` : s);
}

/** The bound values of ACCOUNT_ACTIVITY_SQL, in order. */
export const accountActivityArgs = (now: Date, limit: number) => {
  const since = (days: number) => dbStamp(new Date(now.getTime() - days * 86_400_000));
  return [since(30), since(7), since(30), limit];
};

/** The rows Insights' rules take (lib/insights.ts), read in one query. */
export async function accountActivity(prisma: PrismaClient, now: Date, limit: number) {
  const rows = await prisma.$queryRawUnsafe<AccountActivityRow[]>(
    ACCOUNT_ACTIVITY_SQL,
    ...accountActivityArgs(now, limit),
  );
  return {
    entryStats: rows
      .filter((r) => r.first !== null)
      .map((r) => ({ user_id: r.user_id, first: fromDbStamp(r.first ?? "") })),
    entries30: rows
      .filter((r) => Number(r.created30) > 0)
      .map((r) => ({ user_id: r.user_id, count: Number(r.created30) })),
    active7: rows.filter((r) => Number(r.active7) === 1).map((r) => r.user_id),
    active30: rows.filter((r) => Number(r.active30) === 1).map((r) => r.user_id),
  };
}
