import { appUrl } from "@/lib/mailer";
import { getPrisma } from "@/lib/prisma";
import { handleMcpHttp } from "@/server/mcp/http";

// The MCP server for AI assistants. Behaviour lives in src/server/mcp/http.ts (and is tested there).
export const dynamic = "force-dynamic";

const handler = async (req: Request) => handleMcpHttp(req, await getPrisma(), appUrl());

export { handler as DELETE, handler as GET, handler as POST };
