import type { PrismaClient } from "@prisma/client";

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Fixed-window counter in D1: at most `limit` hits per `windowSeconds` for `key`.
 *
 * Not perfectly atomic (read, then write), so two simultaneous requests can both slip under the
 * limit by one. That is fine for throttling guessing attacks, which is all this is for.
 */
export async function hitRateLimit(
  prisma: Pick<PrismaClient, "rateLimit">,
  key: string,
  limit: number,
  windowSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<RateLimitResult> {
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  if (!row || row.reset_at <= nowSeconds) {
    await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, reset_at: nowSeconds + windowSeconds },
      update: { count: 1, reset_at: nowSeconds + windowSeconds },
    });
    return { allowed: true };
  }
  if (row.count >= limit) return { allowed: false, retryAfterSeconds: row.reset_at - nowSeconds };
  await prisma.rateLimit.update({ where: { key }, data: { count: row.count + 1 } });
  return { allowed: true };
}

/** Forget a counter, for example after a successful sign-in. */
export async function clearRateLimit(prisma: Pick<PrismaClient, "rateLimit">, key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

/** "about 12 minutes" for an error message. */
export function describeWait(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
}

// Limits, in one place.
export const LOGIN_PER_EMAIL = { limit: 10, windowSeconds: 15 * 60 };
export const LOGIN_PER_IP = { limit: 40, windowSeconds: 15 * 60 };
export const REGISTER_PER_IP = { limit: 5, windowSeconds: 60 * 60 };
