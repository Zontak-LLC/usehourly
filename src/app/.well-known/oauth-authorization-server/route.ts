import { appUrl } from "@/lib/mailer";
import { authorizationServerMetadata, CORS } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export const GET = () => Response.json(authorizationServerMetadata(appUrl()), { headers: CORS });
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
