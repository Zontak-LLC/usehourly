import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

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
  TOOLS_BY_NAME,
} from "./tools";

/**
 * A small MCP server (Streamable HTTP, stateless, JSON responses). It speaks JSON-RPC 2.0 and
 * implements initialize, ping, tools, resources and prompts. There is no session and no streaming:
 * every request stands alone, which is what a Worker wants.
 */

export const SERVER_INFO = { name: "usehourly", title: "UseHourly", version: "1.0.0" };
export const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const INSTRUCTIONS = [
  "UseHourly tracks a freelancer's time. Time is whole minutes; dates are local calendar dates (YYYY-MM-DD).",
  "The server runs in UTC and does not know the user's today: always pass the date you mean.",
  'Name projects as "Client / Project" or by id (list_projects shows both). Money is in dollars.',
  "Before adding time, check list_entries for that day so nothing is logged twice.",
  "Ask the user before destructive actions (delete_entry, delete_invoice, merge_entries) and before create_invoice.",
].join(" ");

/** The tool list as clients see it; the public server card publishes the same thing. */
export function toolDefinitions() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: inputSchemaFor(t.name),
    outputSchema: outputSchemaFor(t.name),
    annotations: {
      title: t.title,
      readOnlyHint: t.access === "read",
      destructiveHint: t.access === "write" ? Boolean(t.destructive) : false,
      idempotentHint: Boolean(t.idempotent),
      openWorldHint: false,
    },
  }));
}

/** The prompt list as clients see it. */
export function promptDefinitions() {
  return PROMPTS.map(({ name, title, description, arguments: args }) => ({
    name,
    title,
    description,
    arguments: args,
  }));
}

export const CAPABILITIES = {
  tools: { listChanged: false },
  resources: { listChanged: false },
  prompts: { listChanged: false },
};

/**
 * Everything a client can learn without calling a tool. The stdio bridge (bridge/) ships this as
 * catalog.json so it can answer the handshake and the lists offline; a test keeps the file in step.
 */
export function mcpCatalog() {
  return {
    protocolVersions: [...SUPPORTED_VERSIONS],
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
    capabilities: CAPABILITIES,
    tools: toolDefinitions(),
    resources: RESOURCES,
    resourceTemplates: RESOURCE_TEMPLATES,
    prompts: promptDefinitions(),
  };
}

const ERR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

type Id = string | number | null;
type RpcResponse = {
  jsonrpc: "2.0";
  id: Id;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const ok = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
const fail = (id: Id, code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

const requestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

export type McpDeps = { prisma: PrismaClient; auth: McpAuth };

/** The JSON Schema for a tool's arguments, computed once. */
const schemaCache = new Map<string, Record<string, unknown>>();
function inputSchemaFor(name: string): Record<string, unknown> {
  let s = schemaCache.get(name);
  if (!s) {
    const tool = TOOLS_BY_NAME.get(name);
    const generated = tool
      ? (z.toJSONSchema(tool.input, { io: "input", unrepresentable: "any" }) as Record<string, unknown>)
      : { type: "object" };
    const { $schema: _drop, ...rest } = generated;
    s = rest;
    schemaCache.set(name, s);
  }
  return s;
}

/** The JSON Schema for what a tool returns in structuredContent, computed once. */
const outputCache = new Map<string, Record<string, unknown>>();
function outputSchemaFor(name: string): Record<string, unknown> {
  let s = outputCache.get(name);
  if (!s) {
    const schema = OUTPUT_SCHEMAS[name];
    if (!schema) throw new Error(`Tool "${name}" has no output schema (add it to output-schemas.ts).`);
    const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }) as Record<
      string,
      unknown
    >;
    s = rest;
    outputCache.set(name, s);
  }
  return s;
}

const MAX_TEXT = 120_000;

async function callTool(params: unknown, deps: McpDeps): Promise<{ result?: unknown; error?: [number, string] }> {
  const p = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).optional() }).safeParse(params);
  if (!p.success) return { error: [ERR.invalidParams, "tools/call needs a tool name and an arguments object."] };
  const tool = TOOLS_BY_NAME.get(p.data.name);
  if (!tool) return { error: [ERR.invalidParams, `Unknown tool: ${p.data.name}`] };

  const textResult = (text: string, isError: boolean, structured?: unknown) => ({
    result: {
      content: [{ type: "text", text }],
      ...(structured !== undefined && { structuredContent: structured }),
      isError,
    },
  });

  if (tool.access === "write" && deps.auth.access !== "write") {
    return textResult(
      `This token is read-only, so "${tool.name}" is not allowed. Make a token with write access in UseHourly under Account.`,
      true,
    );
  }
  const parsed = tool.input.safeParse(p.data.arguments ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return textResult(`Invalid arguments. ${where}${issue?.message ?? "Check the tool's input schema."}`, true);
  }

  try {
    const caller = callerFor(deps.prisma, deps.auth.userId);
    const out = await tool.run(caller, parsed.data as never, {
      prisma: deps.prisma,
      userId: deps.auth.userId,
      access: deps.auth.access,
    });
    const text = JSON.stringify(out ?? { ok: true }, null, 2);
    if (text.length > MAX_TEXT) {
      return textResult("That result is too large to return. Narrow the date range or filter by project.", true);
    }
    const structured = out && typeof out === "object" && !Array.isArray(out) ? out : undefined;
    return textResult(text, false, structured);
  } catch (e) {
    return textResult(describeError(e), true);
  }
}

async function dispatch(
  method: string,
  params: unknown,
  deps: McpDeps,
): Promise<{ result?: unknown; error?: [number, string] }> {
  switch (method) {
    case "initialize": {
      const asked = (params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
      const version = SUPPORTED_VERSIONS.find((v) => v === asked) ?? SUPPORTED_VERSIONS[0];
      return {
        result: {
          protocolVersion: version,
          capabilities: CAPABILITIES,
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { result: {} };
    case "logging/setLevel":
      return { result: {} };

    case "tools/list":
      return {
        result: {
          tools: toolDefinitions(),
        },
      };
    case "tools/call":
      return callTool(params, deps);

    case "resources/list":
      return { result: { resources: RESOURCES } };
    case "resources/templates/list":
      return { result: { resourceTemplates: RESOURCE_TEMPLATES } };
    case "resources/read": {
      const p = z.object({ uri: z.string() }).safeParse(params);
      if (!p.success) return { error: [ERR.invalidParams, "resources/read needs a uri."] };
      try {
        const data = await readResource(callerFor(deps.prisma, deps.auth.userId), p.data.uri);
        return {
          result: {
            contents: [{ uri: p.data.uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
          },
        };
      } catch (e) {
        return { error: [ERR.invalidParams, describeError(e)] };
      }
    }

    case "prompts/list":
      return { result: { prompts: promptDefinitions() } };
    case "prompts/get": {
      const p = z
        .object({ name: z.string(), arguments: z.record(z.string(), z.string()).optional() })
        .safeParse(params);
      if (!p.success) return { error: [ERR.invalidParams, "prompts/get needs a prompt name."] };
      const prompt = PROMPTS.find((x) => x.name === p.data.name);
      if (!prompt) return { error: [ERR.invalidParams, `Unknown prompt: ${p.data.name}`] };
      const args = p.data.arguments ?? {};
      const missing = prompt.arguments.filter((a) => a.required && !args[a.name]).map((a) => a.name);
      if (missing.length) return { error: [ERR.invalidParams, `Missing argument: ${missing.join(", ")}`] };
      return {
        result: {
          description: prompt.description,
          messages: [{ role: "user", content: { type: "text", text: prompt.build(args) } }],
        },
      };
    }

    default:
      return { error: [ERR.methodNotFound, `Method not found: ${method}`] };
  }
}

async function handleOne(raw: unknown, deps: McpDeps): Promise<RpcResponse | null> {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    // A response (has result/error) or junk. Nothing to answer unless it looked like a request with an id.
    const id = (raw as { id?: unknown } | null)?.id;
    if (raw && typeof raw === "object" && ("result" in raw || "error" in raw)) return null;
    return fail(
      typeof id === "string" || typeof id === "number" ? id : null,
      ERR.invalidRequest,
      "Not a valid JSON-RPC 2.0 request.",
    );
  }
  const { id, method, params } = parsed.data;
  if (id === undefined) return null; // a notification: no reply (initialized, cancelled, ...)
  try {
    const out = await dispatch(method, params, deps);
    return out.error ? fail(id, out.error[0], out.error[1]) : ok(id, out.result ?? {});
  } catch (e) {
    console.error("MCP internal error:", e);
    return fail(id, ERR.internal, "Something went wrong. Please try again.");
  }
}

/** Handles a POST body (one message or a batch). `body: undefined` means 202 with nothing to say. */
export async function handleMcp(body: unknown, deps: McpDeps): Promise<{ status: number; body?: unknown }> {
  if (Array.isArray(body)) {
    if (body.length === 0) return { status: 400, body: fail(null, ERR.invalidRequest, "Empty batch.") };
    const replies = (await Promise.all(body.map((m) => handleOne(m, deps)))).filter(
      (r): r is RpcResponse => r !== null,
    );
    return replies.length ? { status: 200, body: replies } : { status: 202 };
  }
  const reply = await handleOne(body, deps);
  if (!reply) return { status: 202 };
  return { status: reply.error?.code === ERR.invalidRequest ? 400 : 200, body: reply };
}

export const PARSE_ERROR = fail(null, ERR.parse, "Parse error: the body is not valid JSON.");
