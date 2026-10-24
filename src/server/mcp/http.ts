import type { PrismaClient } from "@prisma/client";
import { createMcpHttpHandler } from "trpc-mcp-server";

import { clientIpFrom } from "@/lib/client-ip";
import { wwwAuthenticate } from "@/lib/oauth";
import { hitRateLimit } from "@/lib/rate-limit";

import { authenticateMcp, type McpAuth } from "./auth";
import { handleMcp, MCP_MAX_BATCH } from "./protocol";

export { originAllowed } from "trpc-mcp-server";

/** One token may make this many calls a minute: plenty for an assistant, a stop for a runaway loop. */
export const MCP_PER_TOKEN = { limit: 120, windowSeconds: 60 };

/** The whole HTTP behaviour of /api/mcp, kept apart from Next so scenario tests can drive it. */
export function handleMcpHttp(req: Request, prisma: PrismaClient, appUrl?: string): Promise<Response> {
  const handler = createMcpHttpHandler<McpAuth>({
    server: { handle: (body, auth) => handleMcp(body, { prisma, auth }), maxBatch: MCP_MAX_BATCH },
    appUrl,
    authenticate: async (r) => {
      const outcome = await authenticateMcp(prisma, r.headers.get("authorization"), clientIpFrom(r.headers));
      if (outcome.ok) return { ok: true, ctx: outcome.auth };
      return {
        ok: false,
        status: outcome.status,
        message: outcome.message,
        headers: {
          ...(outcome.status === 401 && { "www-authenticate": wwwAuthenticate(appUrl ?? "https://usehourly.app") }),
          ...(outcome.retryAfterSeconds && { "retry-after": String(outcome.retryAfterSeconds) }),
        },
      };
    },
    // Every message in a batch counts (cost), so a batch cannot multiply the limit.
    rateLimit: (auth, cost) =>
      hitRateLimit(prisma, `mcp:${auth.tokenId}`, MCP_PER_TOKEN.limit, MCP_PER_TOKEN.windowSeconds, undefined, cost),
  });
  return handler(req);
}
