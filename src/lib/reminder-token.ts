/**
 * Signed tokens for the weekly reminder, made with HMAC-SHA256 from the app's own secret, so there is
 * nothing extra to store or to configure:
 *  - an unsubscribe token for one person (in the email footer and the List-Unsubscribe header);
 *  - the key the hourly cron job uses to call the app's internal reminder route.
 */
const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return btoa(String.fromCharCode(...sig))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Compares in constant time, so the check does not leak how much of a token was right. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const unsubscribeToken = (secret: string, userId: string) => hmac(secret, `reminder-off:${userId}`);

export async function verifyUnsubscribeToken(secret: string, userId: string, token: string): Promise<boolean> {
  if (!secret || !userId || !token) return false;
  return sameString(await unsubscribeToken(secret, userId), token);
}

export const cronToken = (secret: string) => hmac(secret, "cron:weekly-reminders");

export async function verifyCronToken(secret: string, header: string | null): Promise<boolean> {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!secret || !m) return false;
  return sameString(await cronToken(secret), m[1]);
}
