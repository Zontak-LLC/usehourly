import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { describeWait, hitRateLimit } from "@/lib/rate-limit";

/**
 * How fast one account (or, before sign-in, one connection) may send changes to /api/trpc.
 * Reads are not limited: they cost the visitor nothing to repeat and the page makes many. Each
 * HTTP request counts once, and a request may carry at most MAX_BATCH calls (lib/trpc-limits.ts),
 * so the most a signed-in account can do is WRITES_PER_USER x MAX_BATCH calls a minute.
 */
export const WRITES_PER_USER = { limit: 120, windowSeconds: 60 };
export const WRITES_PER_ANON_IP = { limit: 30, windowSeconds: 60 };

/** Throws TOO_MANY_REQUESTS when this caller has sent too many changes in the last minute. */
export async function enforceRequestLimits(
  prisma: Pick<PrismaClient, "rateLimit">,
  who: { method: string; userId?: string | null; ip?: string | null },
): Promise<void> {
  if (who.method !== "POST") return;
  const target = who.userId
    ? { key: `write:user:${who.userId}`, ...WRITES_PER_USER }
    : who.ip
      ? { key: `write:ip:${who.ip}`, ...WRITES_PER_ANON_IP }
      : null;
  if (!target) return;
  const r = await hitRateLimit(prisma, target.key, target.limit, target.windowSeconds);
  if (!r.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `You're going a little fast. Please try again in ${describeWait(r.retryAfterSeconds)}.`,
    });
  }
}
