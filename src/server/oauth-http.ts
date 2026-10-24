import { CORS } from "@/lib/oauth";

const MAX_BODY = 16 * 1024;

/** Headers for every answer from the token and revocation endpoints: never cached. */
export const OAUTH_JSON_HEADERS = {
  ...CORS,
  "cache-control": "no-store",
  pragma: "no-cache",
  "content-type": "application/json",
} as const;

const fail = (status: number, error_description: string) =>
  new Response(JSON.stringify({ error: "invalid_request", error_description }), {
    status,
    headers: OAUTH_JSON_HEADERS,
  });

/**
 * Reads the string fields of an OAuth request body (form-encoded, as the specs say, or JSON, which some clients
 * send). Returns a ready error Response when the body is too large or unreadable.
 */
export async function readOAuthFields<K extends string>(
  req: Request,
  keys: readonly K[],
): Promise<{ fields: Partial<Record<K, string>> } | { response: Response }> {
  const text = await req.text();
  if (text.length > MAX_BODY) return { response: fail(413, "Too large.") };
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = (req.headers.get("content-type") ?? "").includes("json")
      ? JSON.parse(text)
      : Object.fromEntries(new URLSearchParams(text));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    raw = parsed as Record<string, unknown>;
  } catch {
    return { response: fail(400, "Unreadable body.") };
  }
  const fields: Partial<Record<K, string>> = {};
  for (const k of keys) if (typeof raw[k] === "string") fields[k] = raw[k] as string;
  return { fields };
}

/** Turns an OAuth error result into its JSON answer. */
export function oauthErrorResponse(result: { status?: number; error: string; error_description: string }) {
  const { status, ...err } = result;
  return new Response(JSON.stringify(err), { status: status ?? 400, headers: OAUTH_JSON_HEADERS });
}
