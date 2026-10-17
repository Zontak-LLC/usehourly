import { appUrl } from "@/lib/mailer";
import { CORS, protectedResourceMetadata } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export const GET = () => Response.json(protectedResourceMetadata(appUrl()), { headers: CORS });
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
