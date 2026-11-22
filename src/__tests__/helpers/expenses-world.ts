import { vi } from "vitest";

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

/** A tRPC caller for the whole app router, given a session and a (fake) Prisma client. */
export const createCaller = createCallerFactory(appRouter);

/** One row of the fake `expenses` table. */
export type Row = Record<string, unknown> & { id: string; user_id: string; date: string; created_at: number };

/**
 * An in-memory `expenses` table and two accounts' clients, with just the Prisma calls the router makes. Returns the
 * fake `prisma` (its methods are spies), `as(userId, demo?)` for a signed-in caller and `rows()` for the table.
 */
export function world(opts: { count?: number } = {}) {
  let rows: Row[] = [];
  let seq = 0;
  const clients = [
    { id: "c1", user_id: "u1", name: "Acme" },
    { id: "c2", user_id: "u2", name: "Globex" },
  ];
  const owns = (r: Row, where: { id?: string; user_id?: string }) =>
    (where.id === undefined || r.id === where.id) && (where.user_id === undefined || r.user_id === where.user_id);
  const withClient = (r: Row) => ({
    ...r,
    client: r.client_id ? { name: clients.find((c) => c.id === r.client_id)?.name ?? "" } : null,
  });
  const prisma = {
    authUser: { findUnique: vi.fn(async () => ({ currency: "USD" })) },
    client: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; user_id: string } }) =>
          clients.find((c) => c.id === where.id && c.user_id === where.user_id) ?? null,
      ),
    },
    expense: {
      count: vi.fn(
        async ({ where }: { where: { user_id: string } }) =>
          opts.count ?? rows.filter((r) => r.user_id === where.user_id).length,
      ),
      create: vi.fn(async ({ data }: { data: Omit<Row, "id" | "created_at"> }) => {
        seq += 1;
        const row = { ...data, id: `x${seq}`, created_at: seq } as Row;
        rows.push(row);
        return withClient(row);
      }),
      findMany: vi.fn(async ({ where }: { where: { user_id: string; date: { gte: string; lte: string } } }) =>
        rows
          .filter((r) => r.user_id === where.user_id && r.date >= where.date.gte && r.date <= where.date.lte)
          .sort((a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at)
          .map(withClient),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; user_id: string }; data: Partial<Row> }) => {
        const hit = rows.filter((r) => owns(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: string; user_id: string } }) => {
        const before = rows.length;
        rows = rows.filter((r) => !owns(r, where));
        return { count: before - rows.length };
      }),
    },
  };
  const as = (id: string, demo = false) =>
    createCaller({
      session: { user: { id, ...(demo ? { demo: true } : {}) }, expires: "" } as never,
      prisma: prisma as never,
    });
  return { prisma, as, rows: () => rows };
}
