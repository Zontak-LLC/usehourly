import { clientIpFrom } from "@/lib/client-ip";
import { CORS } from "@/lib/oauth";
import { getPrisma } from "@/lib/prisma";
import { registerClient } from "@/server/oauth";

export const dynamic = "force-dynamic";
const MAX_BODY = 16 * 1024;

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

/** Dynamic client registration (RFC 7591): an MCP client announces itself and its redirect addresses. */
export async function POST(req: Request) {
  const headers = { ...CORS, "cache-control": "no-store", "content-type": "application/json" };
  const text = await req.text();
  if (text.length > MAX_BODY)
    return new Response(JSON.stringify({ error: "invalid_client_metadata", error_description: "Too large." }), {
      status: 413,
      headers,
    });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_client_metadata", error_description: "Send valid JSON." }), {
      status: 400,
      headers,
    });
  }
  const result = await registerClient(await getPrisma(), body, clientIpFrom(req.headers));
  if ("error" in result) {
    const { status, ...err } = result;
    return new Response(JSON.stringify(err), { status: status ?? 400, headers });
  }
  return new Response(JSON.stringify(result), { status: 201, headers });
}
