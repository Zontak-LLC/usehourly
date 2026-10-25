import { logError } from "@/lib/log";
import { appUrl } from "@/lib/mailer";
import { getPrisma } from "@/lib/prisma";
import { TimeLimitError, withTimeout } from "@/lib/time-limit";
import { CANT_CHECK_TOKENS, MCP_LIMITS } from "@/server/mcp/auth";
import { handleMcpHttp } from "@/server/mcp/http";

// The MCP server for AI assistants. Behaviour lives in src/server/mcp/http.ts (and is tested there).
export const dynamic = "force-dynamic";

const handler = async (req: Request) => {
  let prisma: Awaited<ReturnType<typeof getPrisma>>;
  try {
    // A stalled D1 must not hold the request until Cloudflare cuts it (incident 2026-10-25).
    prisma = await withTimeout(getPrisma(), MCP_LIMITS.openMs, "mcp database open");
  } catch (err) {
    if (!(err instanceof TimeLimitError)) throw err;
    logError("mcp_prisma_timeout", err);
    return Response.json(
      { error: CANT_CHECK_TOKENS },
      { status: 503, headers: { "retry-after": String(MCP_LIMITS.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
  }
  return handleMcpHttp(req, prisma, appUrl());
};

export { handler as DELETE, handler as GET, handler as POST };
