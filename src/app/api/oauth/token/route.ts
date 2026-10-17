import { CORS } from "@/lib/oauth";
import { getPrisma } from "@/lib/prisma";
import { exchangeCode, type TokenRequest } from "@/server/oauth";

export const dynamic = "force-dynamic";
const MAX_BODY = 16 * 1024;

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

/** Trades a one-time authorization code (plus the PKCE verifier) for an access token. */
export async function POST(req: Request) {
  const headers = { ...CORS, "cache-control": "no-store", pragma: "no-cache", "content-type": "application/json" };
  const text = await req.text();
  if (text.length > MAX_BODY) {
    return new Response(JSON.stringify({ error: "invalid_request", error_description: "Too large." }), {
      status: 413,
      headers,
    });
  }
  let fields: Record<string, unknown> = {};
  try {
    fields = (req.headers.get("content-type") ?? "").includes("json")
      ? JSON.parse(text)
      : Object.fromEntries(new URLSearchParams(text));
  } catch {
    return new Response(JSON.stringify({ error: "invalid_request", error_description: "Unreadable body." }), {
      status: 400,
      headers,
    });
  }
  const str = (k: string) => (typeof fields[k] === "string" ? (fields[k] as string) : undefined);
  const request: TokenRequest = {
    grant_type: str("grant_type"),
    code: str("code"),
    redirect_uri: str("redirect_uri"),
    client_id: str("client_id"),
    code_verifier: str("code_verifier"),
  };
  const result = await exchangeCode(await getPrisma(), request, req.headers.get("cf-connecting-ip"));
  if ("error" in result) {
    const { status, ...err } = result;
    return new Response(JSON.stringify(err), { status: status ?? 400, headers });
  }
  return new Response(JSON.stringify(result), { status: 200, headers });
}
