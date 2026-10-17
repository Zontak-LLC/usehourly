import { hashToken } from "@/lib/email-token";

/**
 * Personal access tokens for the MCP server. A token looks like `uh_` followed by 43 random
 * URL-safe characters. Only its SHA-256 is stored (see ApiToken in the schema); the secret is
 * shown once, when it is made.
 */
export const TOKEN_PREFIX = "uh_";

export type TokenAccess = "read" | "write";

/** How long a new token lives. `null` = until revoked. */
export const EXPIRY_CHOICES = [
  { key: "30d", label: "30 days", seconds: 30 * 24 * 3600 },
  { key: "90d", label: "90 days", seconds: 90 * 24 * 3600 },
  { key: "1y", label: "1 year", seconds: 365 * 24 * 3600 },
  { key: "never", label: "Never expires", seconds: null },
] as const;
export type ExpiryKey = (typeof EXPIRY_CHOICES)[number]["key"];

export const MAX_TOKENS_PER_USER = 20;

/** A new secret: `uh_` + 32 random bytes, base64url. */
export function newApiToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const body = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${TOKEN_PREFIX}${body}`;
}

/** The part safe to show in a list: `uh_` and the first five characters of the secret. */
export function tokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX.length + 5);
}

export function hashApiToken(token: string): Promise<string> {
  return hashToken(token);
}

/** Pulls the secret out of an `Authorization: Bearer <token>` header; null when it isn't one. */
export function bearerToken(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  if (!m) return null;
  const token = m[1];
  // Cheap shape check first so random junk never reaches the database.
  return token.startsWith(TOKEN_PREFIX) && token.length >= TOKEN_PREFIX.length + 20 && token.length <= 128
    ? token
    : null;
}

export function expiryToEpoch(key: ExpiryKey, nowSeconds = Math.floor(Date.now() / 1000)): number | null {
  const choice = EXPIRY_CHOICES.find((c) => c.key === key);
  return choice?.seconds ? nowSeconds + choice.seconds : null;
}

export type TokenState = "active" | "expired" | "revoked";

export function tokenState(
  row: { expires_at: number | null; revoked_at: number | null },
  nowSeconds = Math.floor(Date.now() / 1000),
): TokenState {
  if (row.revoked_at) return "revoked";
  if (row.expires_at !== null && row.expires_at <= nowSeconds) return "expired";
  return "active";
}
