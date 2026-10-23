import { clientIpFrom } from "@/lib/client-ip";
import { CORS } from "@/lib/oauth";
import { getPrisma } from "@/lib/prisma";
import { revokeToken } from "@/server/oauth";
import { OAUTH_JSON_HEADERS, oauthErrorResponse, readOAuthFields } from "@/server/oauth-http";

export const dynamic = "force-dynamic";

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

/** Token revocation (RFC 7009): an app hands back a token it no longer needs. */
export async function POST(req: Request) {
  const read = await readOAuthFields(req, ["token", "token_type_hint", "client_id"]);
  if ("response" in read) return read.response;
  const result = await revokeToken(await getPrisma(), read.fields, clientIpFrom(req.headers));
  if ("error" in result) return oauthErrorResponse(result);
  return new Response(null, { status: 200, headers: OAUTH_JSON_HEADERS });
}
