/**
 * Resend sends delivery events (bounces, spam complaints) signed with Svix. Pure helpers, so the
 * rules are testable without a network: check the signature, then decide which addresses to stop mailing.
 */
const TOLERANCE_SECONDS = 5 * 60;

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Signs "<id>.<timestamp>.<body>" with the webhook secret (whsec_...). Exported for tests. */
export async function svixSign(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    b64ToBytes(secret.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToB64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
}

export async function verifySvix(opts: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null; // "v1,abc v1,def"
  body: string;
  nowSeconds?: number;
}): Promise<boolean> {
  const { secret, id, timestamp, signature, body } = opts;
  if (!id || !timestamp || !signature) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(now - sent) > TOLERANCE_SECONDS) return false;
  let expected: string;
  try {
    expected = await svixSign(secret, id, timestamp, body);
  } catch {
    return false;
  }
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    return version === "v1" && value !== undefined && sameText(value, expected);
  });
}

/**
 * The addresses to stop mailing for this event, or [] to ignore it. Only permanent bounces and spam
 * complaints count: a full mailbox (a transient bounce) clears itself and must not silence a real person.
 */
export function addressesToSuppress(event: unknown): string[] {
  if (typeof event !== "object" || event === null) return [];
  const { type, data } = event as { type?: unknown; data?: { to?: unknown; bounce?: { type?: unknown } } };
  const permanent = type === "email.bounced" && String(data?.bounce?.type ?? "").toLowerCase() === "permanent";
  if (!permanent && type !== "email.complained") return [];
  const to = data?.to;
  const list = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
  return list.filter((a): a is string => typeof a === "string").map((a) => a.trim().toLowerCase());
}
