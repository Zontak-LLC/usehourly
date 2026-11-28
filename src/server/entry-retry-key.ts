import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { errorCode } from "@/lib/error-code";

import { QuotaInsertDuplicate } from "./quota-insert";

/** The longest retry key a caller may send. */
export const RETRY_KEY_MAX = 100;

/** An optional retry key: sending the same one again returns the entry the first call saved. */
export const retryKeySchema = z.string().trim().min(1).max(RETRY_KEY_MAX).optional();

/** The key one day of a multi-day call is stored under. */
export function dayRetryKey(key: string, date: string): string {
  return `${key}:${date}`;
}

/** The account's entry saved under `key`, with the `include` the caller returns entries with, or null. */
export async function findKeyedEntry<I extends Prisma.TimeEntryInclude>(
  ctx: { prisma: PrismaClient; userId: string },
  key: string,
  include: I,
) {
  return ctx.prisma.timeEntry.findFirst({ where: { user_id: ctx.userId, retry_key: key }, include });
}

/** The keys among `keys` that the account already has an entry for. */
export async function findTakenKeys(ctx: { prisma: PrismaClient; userId: string }, keys: string[]) {
  const rows = await ctx.prisma.timeEntry.findMany({
    where: { user_id: ctx.userId, retry_key: { in: keys } },
    select: { retry_key: true },
  });
  return new Set(rows.flatMap((r) => (r.retry_key ? [r.retry_key] : [])));
}

/** True when a write lost on a unique index (the key was taken at the same moment by another call). */
export function isKeyClash(err: unknown): boolean {
  if (err instanceof QuotaInsertDuplicate || errorCode(err) === "P2002") return true;
  return /UNIQUE constraint failed/.test(err instanceof Error ? err.message : String(err));
}
