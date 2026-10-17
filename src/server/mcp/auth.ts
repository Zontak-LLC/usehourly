import type { PrismaClient } from "@prisma/client";

import { bearerToken, hashApiToken, type TokenAccess, tokenState } from "@/lib/api-token";
import { hitRateLimit } from "@/lib/rate-limit";
import { sessionStillValid } from "@/lib/session-version";

export type McpAuth = { userId: string; access: TokenAccess; tokenId: string; tokenName: string };

export type AuthOutcome =
  | { ok: true; auth: McpAuth }
  | { ok: false; status: 401 | 429; message: string; retryAfterSeconds?: number };

/** Failed attempts per address: a token is 256 random bits, so this only protects the database. */
const FAILS_PER_IP = { limit: 30, windowSeconds: 15 * 60 };
/** How often `last_used_at` is refreshed, so a busy client doesn't write on every call. */
const TOUCH_EVERY_SECONDS = 60;

const reject = (message = "Missing or invalid access token."): AuthOutcome => ({ ok: false, status: 401, message });

/**
 * Checks `Authorization: Bearer uh_...` against the stored hashes. A token stops working when it is
 * revoked, expired, or older than the account's last password change / "log out everywhere".
 */
export async function authenticateMcp(
  prisma: PrismaClient,
  header: string | null,
  ip: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AuthOutcome> {
  const failed = async (message?: string): Promise<AuthOutcome> => {
    if (ip) {
      const hit = await hitRateLimit(
        prisma,
        `mcp-fail:${ip}`,
        FAILS_PER_IP.limit,
        FAILS_PER_IP.windowSeconds,
        nowSeconds,
      );
      if (!hit.allowed) {
        return {
          ok: false,
          status: 429,
          message: "Too many failed attempts. Try again later.",
          retryAfterSeconds: hit.retryAfterSeconds,
        };
      }
    }
    return reject(message);
  };

  const token = bearerToken(header);
  if (!token) return failed();

  const row = await prisma.apiToken.findUnique({
    where: { token_hash: await hashApiToken(token) },
    include: { user: { select: { id: true, token_version: true } } },
  });
  if (!row) return failed();

  const state = tokenState(row, nowSeconds);
  if (state === "revoked") return failed("This token was revoked. Make a new one in UseHourly under Account.");
  if (state === "expired") return failed("This token has expired. Make a new one in UseHourly under Account.");
  if (!sessionStillValid(row.token_version, row.user.token_version)) {
    return failed("This token was signed out when the password changed. Make a new one in UseHourly under Account.");
  }

  if (row.last_used_at === null || nowSeconds - row.last_used_at >= TOUCH_EVERY_SECONDS) {
    try {
      await prisma.apiToken.update({ where: { id: row.id }, data: { last_used_at: nowSeconds } });
    } catch (err) {
      // Cosmetic ("last used" in the token list); the request itself is fine.
      console.error("MCP last_used_at update failed:", err);
    }
  }
  return {
    ok: true,
    auth: {
      userId: row.user.id,
      access: row.access === "write" ? "write" : "read", // anything unexpected is read-only
      tokenId: row.id,
      tokenName: row.name,
    },
  };
}
