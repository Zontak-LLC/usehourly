import type { PrismaClient } from "@prisma/client";

import { bearerToken, hashApiToken, type TokenAccess, tokenState } from "@/lib/api-token";
import { logError } from "@/lib/log";
import { hitRateLimit } from "@/lib/rate-limit";
import { sessionStillValid } from "@/lib/session-version";
import { TimeLimitError, withTimeout } from "@/lib/time-limit";

export type McpAuth = { userId: string; access: TokenAccess; tokenId: string; tokenName: string };

export type AuthOutcome =
  | { ok: true; auth: McpAuth }
  | { ok: false; status: 401 | 429 | 503; message: string; retryAfterSeconds?: number };

/** Failed attempts per address: a token is 256 random bits, so this only protects the database. */
const FAILS_PER_IP = { limit: 30, windowSeconds: 15 * 60 };
/** How often `last_used_at` is refreshed, so a busy client doesn't write on every call. */
const TOUCH_EVERY_SECONDS = 60;

/**
 * How long /api/mcp waits on the database before it answers anyway (incident 2026-10-25: a stalled D1 held every
 * request for 25-90 s). Opening the client (`api/mcp/route.ts`), the fail counter, the token lookup and the
 * `last_used_at` touch; worst case 2 + 4 + 2 = 8 s. Guarded by `hang-guard-journey.test.ts`.
 */
export const MCP_LIMITS = { openMs: 2000, failCounterMs: 3000, lookupMs: 4000, touchMs: 2000, retryAfterSeconds: 30 };
export const CANT_CHECK_TOKENS = "UseHourly can't check tokens right now. Try again in a minute.";

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
      let hit: Awaited<ReturnType<typeof hitRateLimit>>;
      try {
        hit = await withTimeout(
          hitRateLimit(prisma, `mcp-fail:${ip}`, FAILS_PER_IP.limit, FAILS_PER_IP.windowSeconds, nowSeconds),
          MCP_LIMITS.failCounterMs,
          "mcp fail counter",
        );
      } catch (err) {
        if (!(err instanceof TimeLimitError)) throw err;
        // The caller has no valid token and gets no data, so a refusal without counting it is safe.
        logError("mcp_fail_counter_timeout", err);
        return reject(message);
      }
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

  const findToken = async () =>
    prisma.apiToken.findUnique({
      where: { token_hash: await hashApiToken(token) },
      include: { user: { select: { id: true, token_version: true } } },
    });
  let row: Awaited<ReturnType<typeof findToken>>;
  try {
    row = await withTimeout(findToken(), MCP_LIMITS.lookupMs, "mcp token lookup");
  } catch (err) {
    if (!(err instanceof TimeLimitError)) throw err;
    // The token could not be checked: never let it through, and tell the client to try again.
    logError("mcp_token_lookup_timeout", err);
    return { ok: false, status: 503, message: CANT_CHECK_TOKENS, retryAfterSeconds: MCP_LIMITS.retryAfterSeconds };
  }
  if (!row) return failed();

  const state = tokenState(row, nowSeconds);
  if (state === "revoked") return failed("This token was revoked. Make a new one in UseHourly under Account.");
  if (state === "expired") return failed("This token has expired. Make a new one in UseHourly under Account.");
  if (!sessionStillValid(row.token_version, row.user.token_version)) {
    return failed("This token was signed out when the password changed. Make a new one in UseHourly under Account.");
  }

  if (row.last_used_at === null || nowSeconds - row.last_used_at >= TOUCH_EVERY_SECONDS) {
    try {
      await withTimeout(
        prisma.apiToken.update({ where: { id: row.id }, data: { last_used_at: nowSeconds } }),
        MCP_LIMITS.touchMs,
        "mcp last_used_at update",
      );
    } catch (err) {
      // Cosmetic ("last used" in the token list); the request itself is fine.
      logError("mcp_last_used_update_failed", err);
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
