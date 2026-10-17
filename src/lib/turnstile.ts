/**
 * Cloudflare Turnstile: a free, mostly invisible "are you a person" check on sign-up. It is dormant
 * until TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set, so the app (and every test) works without it.
 */
export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const turnstileSiteKey = (): string | null => process.env.TURNSTILE_SITE_KEY || null;
export const turnstileEnabled = (): boolean =>
  Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

/** True when Cloudflare confirms the token. A missing token, a network error or any doubt is a no. */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string | null | undefined,
  doFetch: typeof fetch = fetch,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await doFetch(TURNSTILE_VERIFY_URL, { method: "POST", body });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
