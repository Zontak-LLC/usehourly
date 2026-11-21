import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { describeWait, hitRateLimit } from "@/lib/rate-limit";

/** The most invoices one account may make per UTC day. Demo accounts hit their lifetime quota of 6 first. */
export const INVOICES_PER_ACCOUNT_PER_DAY = 50;

const SECONDS_PER_DAY = 86_400;

/** Seconds from `nowSeconds` (epoch) to the next 00:00 UTC; at least 1, at most a whole day. */
export function secondsUntilUtcMidnight(nowSeconds: number): number {
  return Math.max(1, SECONDS_PER_DAY - (nowSeconds % SECONDS_PER_DAY));
}

/**
 * Counts one `invoice.create` for the account, in a window that resets at UTC midnight. Called before the snapshot is
 * built, so a refused create stores nothing. Throws TOO_MANY_REQUESTS past `INVOICES_PER_ACCOUNT_PER_DAY`.
 */
export async function assertInvoiceCreateAllowed(ctx: {
  prisma: Pick<PrismaClient, "rateLimit">;
  userId: string;
}): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const result = await hitRateLimit(
    ctx.prisma,
    `invcreate:u:${ctx.userId}`,
    INVOICES_PER_ACCOUNT_PER_DAY,
    secondsUntilUtcMidnight(now),
    now,
  );
  if (result.allowed) return;
  throw new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: `You've made ${INVOICES_PER_ACCOUNT_PER_DAY} invoices today. Try again in ${describeWait(result.retryAfterSeconds)}.`,
  });
}
