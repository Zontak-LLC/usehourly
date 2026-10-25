import { Prisma, type PrismaClient } from "@prisma/client";

import { type QuotaKind, quotaError, quotaLimit } from "@/lib/quotas";

/**
 * The columns a guarded insert may write, per table. Table and column names only ever come from this list, never from
 * input. Every NOT NULL column without a SQL default must be here (quota-race-journey.test.ts reads the live schema).
 */
export const QUOTA_TABLES = {
  clients: ["id", "user_id", "name", "color", "created_at"],
  projects: ["id", "user_id", "client_id", "name", "hourly_rate", "billable", "created_at"],
  time_entries: [
    "id",
    "user_id",
    "project_id",
    "date",
    "minutes",
    "note",
    "started_at",
    "author_id",
    "created_at",
    "updated_at",
  ],
  api_tokens: [
    "id",
    "user_id",
    "name",
    "token_hash",
    "prefix",
    "access",
    "token_version",
    "expires_at",
    "oauth_client_id",
    "created_at",
  ],
} as const;

export type QuotaTable = keyof typeof QUOTA_TABLES;
type Value = string | number | boolean | Date | null;
/** The values to write. `id` is made here when left out; `created_at` (and `updated_at`) are always set here. */
type QuotaRow<T extends QuotaTable> = Partial<
  Record<Exclude<(typeof QUOTA_TABLES)[T][number], "created_at" | "updated_at">, Value>
>;

/** The rows that count toward a limit, and the limit. */
type Quota = { used: Prisma.Sql; limit: number };
/** A quota with the error a person sees when it is full. */
type RefusingQuota = Quota & { refuse: () => Error };

/** The insert lost on a unique index (the same id sent twice, a second running timer, a name taken meanwhile). */
export class QuotaInsertDuplicate extends Error {
  constructor() {
    super("The row already exists.");
    this.name = "QuotaInsertDuplicate";
  }
}

/** `(SELECT COUNT(*) FROM <table> WHERE <where>)`, for `Quota.used`. */
export function countRows(table: QuotaTable, where: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(SELECT COUNT(*) FROM ${Prisma.raw(table)} WHERE ${where})`;
}

/** The account's rows of `table` against its limit for `kind` (lib/quotas.ts). */
export function accountQuota(table: QuotaTable, kind: QuotaKind, userId: string, demo: boolean): RefusingQuota {
  return {
    used: countRows(table, Prisma.sql`user_id = ${userId}`),
    limit: quotaLimit(kind, demo),
    refuse: () => quotaError(kind, demo),
  };
}

/** The account's tokens that still work (revoked ones do not count toward MAX_TOKENS_PER_USER). */
export function liveTokens(userId: string): Prisma.Sql {
  return countRows("api_tokens", Prisma.sql`user_id = ${userId} AND revoked_at IS NULL`);
}

// A raw query's unique failure is not always reported as P2002, so the driver's own words are checked too.
function isUniqueFailure(err: unknown): boolean {
  if ((err as { code?: string } | null)?.code === "P2002") return true;
  const meta = (err as { meta?: unknown } | null)?.meta;
  const text = `${err instanceof Error ? err.message : String(err)} ${meta ? JSON.stringify(meta) : ""}`;
  return /UNIQUE constraint failed|UniqueConstraintViolation/.test(text);
}

/**
 * Counts and inserts in ONE statement: `INSERT INTO t (cols) SELECT values WHERE (used) < limit`. Two creates sent at
 * the same moment cannot both pass the count, because D1 runs one statement at a time and there is no await between the
 * count and the write. Returns the new row's id, or null when the limit is reached (nothing was written). Throws
 * QuotaInsertDuplicate when a unique index refused the row.
 */
export async function insertIfRoom<T extends QuotaTable>(
  prisma: PrismaClient,
  table: T,
  row: QuotaRow<T>,
  quota: Quota,
): Promise<string | null> {
  const now = new Date();
  const id = (row as { id?: Value }).id ?? crypto.randomUUID();
  const values: Record<string, Value> = {
    ...row,
    id,
    created_at: now,
    ...(table === "time_entries" ? { updated_at: now } : {}),
  };
  const allowed: readonly string[] = QUOTA_TABLES[table];
  const columns = Object.keys(values).filter((c) => values[c] !== undefined);
  const unknown = columns.find((c) => !allowed.includes(c));
  if (unknown) throw new Error(`${table}.${unknown} is not in QUOTA_TABLES.`);
  try {
    const changed =
      await prisma.$executeRaw`INSERT INTO ${Prisma.raw(table)} (${Prisma.raw(columns.join(", "))}) SELECT ${Prisma.join(
        columns.map((c) => values[c]),
      )} WHERE ${quota.used} < ${quota.limit}`;
    return changed === 1 ? String(id) : null;
  } catch (err) {
    if (isUniqueFailure(err)) throw new QuotaInsertDuplicate();
    throw err;
  }
}

/** insertIfRoom, refusing at the limit with the message a person sees today (`quota.refuse`). */
export async function insertWithinQuota<T extends QuotaTable>(
  prisma: PrismaClient,
  table: T,
  row: QuotaRow<T>,
  quota: RefusingQuota,
): Promise<string> {
  const id = await insertIfRoom(prisma, table, row, quota);
  if (id === null) throw quota.refuse();
  return id;
}
