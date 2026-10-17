import type { PrismaClient } from "@prisma/client";

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

const errorCode = (e: unknown) => (e as { code?: string } | null)?.code;

type Verdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };
const verdict = (row: { count: number; reset_at: number }, limit: number, now: number): Verdict =>
  row.count > limit ? { allowed: false, retryAfterSeconds: Math.max(1, row.reset_at - now) } : { allowed: true };

/**
 * Fixed-window counter in D1: at most `limit` hits per `windowSeconds` for `key`.
 *
 * Every step is a single database statement, so requests arriving at the same moment cannot
 * overwrite each other's count (an earlier read-then-write version let a burst of parallel guesses
 * all through):
 *   1. a conditional UPDATE starts a fresh window once the old one has ended; of several racing
 *      requests only one matches it;
 *   2. otherwise `count = count + 1` counts this hit;
 *   3. a key's very first hit creates the row, and if another request created it first, counts
 *      itself with step 2 instead.
 * Hits past the limit still add to the count, which is harmless inside a fixed window.
 */
export async function hitRateLimit(
  prisma: Pick<PrismaClient, "rateLimit">,
  key: string,
  limit: number,
  windowSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<RateLimitResult> {
  const table = prisma.rateLimit;
  const fresh = await table.updateMany({
    where: { key, reset_at: { lte: nowSeconds } },
    data: { count: 1, reset_at: nowSeconds + windowSeconds },
  });
  if (fresh.count > 0) return { allowed: true };

  const bump = () => table.update({ where: { key }, data: { count: { increment: 1 } } });
  try {
    return verdict(await bump(), limit, nowSeconds);
  } catch (e) {
    if (errorCode(e) !== "P2025") throw e; // P2025: no row yet
  }
  try {
    await table.create({ data: { key, count: 1, reset_at: nowSeconds + windowSeconds } });
    return { allowed: true };
  } catch (e) {
    if (errorCode(e) !== "P2002") throw e; // P2002: someone created it a moment ago
  }
  return verdict(await bump(), limit, nowSeconds);
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
