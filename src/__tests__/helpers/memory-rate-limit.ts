import { vi } from "vitest";

type Row = { key: string; count: number; reset_at: number };
type CountData = number | { increment: number };

const prismaError = (code: string) => Object.assign(new Error(code), { code });

/**
 * An in-memory stand-in for the rate_limits table. Like the database, each single operation is
 * atomic, but operations from different requests interleave at every `await`, so a test using it
 * can tell a correct counter from one that reads, then writes.
 */
export function memoryRateLimit(seed: Row[] = []) {
  const rows = new Map<string, Row>(seed.map((r) => [r.key, r]));
  return {
    rows,
    rateLimit: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => rows.get(where.key) ?? null),
      upsert: vi.fn(
        async ({ where, create, update }: { where: { key: string }; create: Row; update: Partial<Row> }) => {
          const prev = rows.get(where.key);
          rows.set(where.key, prev ? { ...prev, ...update } : create);
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { key: string; reset_at?: { lte: number } };
          data: { count?: CountData; reset_at?: number };
        }) => {
          const row = rows.get(where.key);
          if (!row || (where.reset_at && !(row.reset_at <= where.reset_at.lte))) return { count: 0 };
          rows.set(where.key, apply(row, data));
          return { count: 1 };
        },
      ),
      update: vi.fn(
        async ({ where, data }: { where: { key: string }; data: { count?: CountData; reset_at?: number } }) => {
          const row = rows.get(where.key);
          if (!row) throw prismaError("P2025");
          const next = apply(row, data);
          rows.set(where.key, next);
          return next;
        },
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        if (rows.has(data.key)) throw prismaError("P2002");
        rows.set(data.key, { ...data });
        return data;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => ({ count: rows.delete(where.key) ? 1 : 0 })),
    },
  };
}

function apply(row: Row, data: { count?: CountData; reset_at?: number }): Row {
  const next = { ...row };
  if (typeof data.count === "number") next.count = data.count;
  else if (data.count) next.count += data.count.increment;
  if (data.reset_at !== undefined) next.reset_at = data.reset_at;
  return next;
}
