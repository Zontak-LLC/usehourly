import type { PrismaClient } from "@prisma/client";
import { createMcpServer, type McpToolDef, PARSE_ERROR } from "trpc-mcp-server";

import { logError } from "@/lib/log";
import { MAX_BATCH } from "@/lib/trpc-limits";

import type { McpAuth } from "./auth";
import { OUTPUT_SCHEMAS } from "./output-schemas";
import {
  callerFor,
  describeError,
  PROMPTS,
  RESOURCE_TEMPLATES,
  RESOURCES,
  readResource,
  TOOLS,
  type ToolContext,
} from "./tools";

/**
 * UseHourly's MCP server: the generic protocol core lives in packages/trpc-mcp (issue 125, the
 * library to be published on its own); this file hands it UseHourly's tools, resources, prompts
 * and words. Every tool still calls the tRPC procedures as the token's owner (tools/core.ts).
 */

export const SERVER_INFO = { name: "usehourly", title: "UseHourly", version: "1.0.0" };
export const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const INSTRUCTIONS = [
  "UseHourly tracks a freelancer's time. Time is whole minutes; dates are local calendar dates (YYYY-MM-DD).",
  "The server runs in UTC and does not know the user's today: always pass the date you mean.",
  'Name projects as "Client / Project" or by id (list_projects shows both). Money is in the account currency (whole units like 85 or 62.5, not cents; whoami says which currency).',
  "Before adding time, check list_entries for that day so nothing is logged twice.",
  "Ask the user before destructive actions (delete_entry, delete_invoice, merge_entries) and before create_invoice.",
].join(" ");

/** Most JSON-RPC messages one POST may carry; each also counts against the token's rate limit. */
export const MCP_MAX_BATCH = MAX_BATCH;

export type McpDeps = { prisma: PrismaClient; auth: McpAuth };

/** The per-request context the package hands to every tool and resource read. */
type Ctx = ToolContext;

const tools: McpToolDef<Ctx>[] = TOOLS.map((t) => {
  const output = OUTPUT_SCHEMAS[t.name];
  if (!output) throw new Error(`Tool "${t.name}" has no output schema (add it to output-schemas.ts).`);
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    access: t.access,
    destructive: t.destructive,
    idempotent: t.idempotent,
    input: t.input,
    output,
    run: (args: never, ctx: Ctx) => t.run(callerFor(ctx.prisma, ctx.userId), args, ctx),
  };
});

const server = createMcpServer<Ctx>({
  info: SERVER_INFO,
  instructions: INSTRUCTIONS,
  protocolVersions: SUPPORTED_VERSIONS,
  tools,
  resources: RESOURCES,
  resourceTemplates: RESOURCE_TEMPLATES,
  readResource: (uri, ctx) => readResource(callerFor(ctx.prisma, ctx.userId), uri),
  prompts: PROMPTS,
  describeError,
  onInternalError: (e) => logError("mcp_internal_error", e),
  readOnlyMessage: (name) =>
    `This token is read-only, so "${name}" is not allowed. Make a token with write access in UseHourly under Account.`,
  maxBatch: MCP_MAX_BATCH,
  tooLargeMessage: "That result is too large to return. Narrow the date range or filter by project.",
});

export const CAPABILITIES = server.capabilities;

/** The tool list as clients see it; the public server card publishes the same thing. */
export const toolDefinitions = () => server.toolDefinitions();

/**
 * Everything a client can learn without calling a tool. The stdio bridge (bridge/) ships this as
 * catalog.json so it can answer the handshake and the lists offline; a test keeps the file in step.
 */
export const mcpCatalog = () => server.catalog();

/** Handles a POST body (one message or a batch). `body: undefined` means 202 with nothing to say. */
export function handleMcp(body: unknown, deps: McpDeps): Promise<{ status: number; body?: unknown }> {
  return server.handle(body, { prisma: deps.prisma, userId: deps.auth.userId, access: deps.auth.access });
}

export { PARSE_ERROR };
