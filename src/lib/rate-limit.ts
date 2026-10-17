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
 *
 * `cost` is how many hits this call is worth (a batch of 20 calls costs 20).
 */
export async function hitRateLimit(
  prisma: Pick<PrismaClient, "rateLimit">,
  key: string,
  limit: number,
  windowSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
  cost = 1,
): Promise<RateLimitResult> {
  const table = prisma.rateLimit;
  const fresh = await table.updateMany({
    where: { key, reset_at: { lte: nowSeconds } },
    data: { count: cost, reset_at: nowSeconds + windowSeconds },
  });
  if (fresh.count > 0) return verdict({ count: cost, reset_at: nowSeconds + windowSeconds }, limit, nowSeconds);

  const bump = () => table.update({ where: { key }, data: { count: { increment: cost } } });
  try {
    return verdict(await bump(), limit, nowSeconds);
  } catch (e) {
    if (errorCode(e) !== "P2025") throw e; // P2025: no row yet
  }
  try {
    await table.create({ data: { key, count: cost, reset_at: nowSeconds + windowSeconds } });
    return verdict({ count: cost, reset_at: nowSeconds + windowSeconds }, limit, nowSeconds);
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
export const LOGIN_PER_EMAIL_AND_IP = { limit: 10, windowSeconds: 15 * 60 };
// Per address over all connections: a ceiling for spread-out guessing, high enough that a stranger's
// wrong passwords from one place (stopped by the limit above) cannot lock the real owner out.
export const LOGIN_PER_EMAIL = { limit: 100, windowSeconds: 15 * 60 };
export const RESET_PER_EMAIL_AND_IP = { limit: 3, windowSeconds: 60 * 60 };
export const RESET_PER_EMAIL = { limit: 20, windowSeconds: 60 * 60 };
export const RESET_PER_IP = { limit: 5, windowSeconds: 60 * 60 };
export const CHANGE_PASSWORD_ATTEMPTS = { limit: 5, windowSeconds: 15 * 60 };
export const LOGIN_PER_IP = { limit: 40, windowSeconds: 15 * 60 };
export const REGISTER_PER_IP = { limit: 5, windowSeconds: 60 * 60 };
