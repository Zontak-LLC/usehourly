import type { PrismaClient } from "@prisma/client";

import { clearRateLimit, hitRateLimit, LOGIN_PER_EMAIL, LOGIN_PER_EMAIL_AND_IP, LOGIN_PER_IP } from "@/lib/rate-limit";
import { swarmPass } from "@/lib/swarm";

type Db = Pick<PrismaClient, "rateLimit">;

const pairKey = (email: string, ip: string | null) => `login:pair:${email}|${ip ?? "?"}`;
const emailKey = (email: string) => `login:email:${email}`;

/**
 * May this sign-in attempt go on to the password check? Guessing is throttled from three sides, and a
 * refused attempt is treated exactly like a wrong password, so it reveals nothing about the account:
 *  - per connection: one source cannot try many accounts;
 *  - per address from one connection: one source cannot hammer one account;
 *  - per address overall, a much higher ceiling: spread-out guessing still has a limit, but a stranger
 *    typing wrong passwords from one place cannot lock the real owner out.
 * The swarm pass (staging only, stress-test accounts only, lib/swarm.ts) skips the throttle; the password check
 * still runs.
 */
export async function loginAllowed(
  prisma: Db,
  email: string,
  ip: string | null,
  headers?: Headers | null,
): Promise<boolean> {
  if (await swarmPass(headers, email)) return true;
  if (ip) {
    const byIp = await hitRateLimit(prisma, `login:ip:${ip}`, LOGIN_PER_IP.limit, LOGIN_PER_IP.windowSeconds);
    if (!byIp.allowed) return false;
  }
  const byPair = await hitRateLimit(
    prisma,
    pairKey(email, ip),
    LOGIN_PER_EMAIL_AND_IP.limit,
    LOGIN_PER_EMAIL_AND_IP.windowSeconds,
  );
  if (!byPair.allowed) return false;
  const byEmail = await hitRateLimit(prisma, emailKey(email), LOGIN_PER_EMAIL.limit, LOGIN_PER_EMAIL.windowSeconds);
  return byEmail.allowed;
}

/** A correct password: forget the counters for this address. */
export async function loginSucceeded(prisma: Db, email: string, ip: string | null): Promise<void> {
  await clearRateLimit(prisma, emailKey(email));
  await clearRateLimit(prisma, pairKey(email, ip));
}
