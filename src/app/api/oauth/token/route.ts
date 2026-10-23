import { clientIpFrom } from "@/lib/client-ip";
import { CORS } from "@/lib/oauth";
import { getPrisma } from "@/lib/prisma";
import { exchangeCode } from "@/server/oauth";
import { OAUTH_JSON_HEADERS, oauthErrorResponse, readOAuthFields } from "@/server/oauth-http";

export const dynamic = "force-dynamic";

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

/** Trades a one-time authorization code (plus the PKCE verifier) for an access token. */
export async function POST(req: Request) {
  const read = await readOAuthFields(req, ["grant_type", "code", "redirect_uri", "client_id", "code_verifier"]);
  if ("response" in read) return read.response;
  const result = await exchangeCode(await getPrisma(), read.fields, clientIpFrom(req.headers));
  if ("error" in result) return oauthErrorResponse(result);
  return new Response(JSON.stringify(result), { status: 200, headers: OAUTH_JSON_HEADERS });
}
