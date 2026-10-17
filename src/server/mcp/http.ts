import type { PrismaClient } from "@prisma/client";

import { wwwAuthenticate } from "@/lib/oauth";
import { hitRateLimit } from "@/lib/rate-limit";

import { authenticateMcp } from "./auth";
import { handleMcp, PARSE_ERROR } from "./protocol";

/** One token may make this many calls a minute: plenty for an assistant, a stop for a runaway loop. */
export const MCP_PER_TOKEN = { limit: 120, windowSeconds: 60 };
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Browsers send an Origin header; command-line MCP clients do not. A request from a web page on
 * another site is refused, so a page the user happens to visit cannot talk to the endpoint (a
 * stolen token is the only other way in). Requests with no Origin pass.
 */
export function originAllowed(origin: string | null, host: string | null, appUrl?: string): boolean {
  if (!origin) return true;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (host && o.host === host) return true;
  if (appUrl) {
    try {
      return new URL(appUrl).host === o.host;
    } catch {
      return false;
    }
  }
  return false;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

/** The whole HTTP behaviour of /api/mcp, kept apart from Next so scenario tests can drive it. */
export async function handleMcpHttp(req: Request, prisma: PrismaClient, appUrl?: string): Promise<Response> {
  if (req.method !== "POST") {
    // No server-sent-event stream and no sessions to delete: this server only answers POSTs.
    return json(405, { error: "Use POST." }, { allow: "POST" });
  }
  if (!originAllowed(req.headers.get("origin"), req.headers.get("host"), appUrl)) {
    return json(403, { error: "Origin not allowed." });
  }

  const outcome = await authenticateMcp(prisma, req.headers.get("authorization"), req.headers.get("cf-connecting-ip"));
  if (!outcome.ok) {
    return json(
      outcome.status,
      { error: outcome.message },
      {
        ...(outcome.status === 401 && { "www-authenticate": wwwAuthenticate(appUrl ?? "https://usehourly.app") }),
        ...(outcome.retryAfterSeconds && { "retry-after": String(outcome.retryAfterSeconds) }),
      },
    );
  }

  const rate = await hitRateLimit(
    prisma,
    `mcp:${outcome.auth.tokenId}`,
    MCP_PER_TOKEN.limit,
    MCP_PER_TOKEN.windowSeconds,
  );
  if (!rate.allowed) {
    return json(
      429,
      { error: "Too many requests. Slow down a little." },
      { "retry-after": String(rate.retryAfterSeconds) },
    );
  }

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return json(413, { error: "Request too large." });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, PARSE_ERROR);
  }

  const reply = await handleMcp(body, { prisma, auth: outcome.auth });
  return reply.body === undefined ? new Response(null, { status: reply.status }) : json(reply.status, reply.body);
}
