import { z } from "zod";

/**
 * A small MCP server core (JSON-RPC 2.0 over a stateless POST). It implements initialize, ping,
 * tools, resources and prompts. There is no session and no streaming: every request stands alone,
 * which is what a serverless Worker wants. It knows nothing about the app: the app hands it tools,
 * resources and prompts, and a context per request (who is calling, with what access).
 */

export type Access = "read" | "write";

/** What every request context must carry: the access the caller's token grants. */
export type BaseContext = { access: Access };

export type McpToolDef<Ctx extends BaseContext> = {
  name: string;
  title: string;
  description: string;
  /** "write" tools are refused for read-only tokens, before the input is even read. */
  access: Access;
  destructive?: boolean;
  idempotent?: boolean;
  /** Validates the arguments; every property should carry `.describe(...)`. */
  input: z.ZodType;
  /** What the tool returns in structuredContent (an object). Required: clients and directories read it. */
  output: z.ZodType;
  run: (args: never, ctx: Ctx) => Promise<unknown>;
};

/** Types a tool's `run` arguments from its input schema, then erases them so tools fit one list. */
export function defineTool<Ctx extends BaseContext, S extends z.ZodType>(
  t: Omit<McpToolDef<Ctx>, "input" | "run"> & { input: S; run: (args: z.infer<S>, ctx: Ctx) => Promise<unknown> },
): McpToolDef<Ctx> {
  return t as McpToolDef<Ctx>;
}

export type McpResource = { uri: string; name: string; title?: string; description?: string; mimeType?: string };
export type McpResourceTemplate = {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
};
export type McpPrompt = {
  name: string;
  title: string;
  description: string;
  arguments: { name: string; description: string; required: boolean }[];
  build: (args: Record<string, string>) => string;
};

export type McpServerOptions<Ctx extends BaseContext> = {
  info: { name: string; title?: string; version: string };
  instructions?: string;
  /** Newest first; the first is answered when a client asks for a version not listed. */
  protocolVersions?: readonly string[];
  tools: McpToolDef<Ctx>[];
  resources?: readonly McpResource[];
  resourceTemplates?: readonly McpResourceTemplate[];
  /** Reads a resource by uri; throw to answer "invalid params" with `describeError`'s text. */
  readResource?: (uri: string, ctx: Ctx) => Promise<unknown>;
  prompts?: McpPrompt[];
  /** Turns a thrown error into text for the model. Never let raw database messages through. */
  describeError: (e: unknown) => string;
  /** Called with an error nothing else caught (the client gets a generic message). */
  onInternalError?: (e: unknown) => void;
  /** The sentence a read-only token gets when it calls a write tool. */
  readOnlyMessage?: (toolName: string) => string;
  /** Most messages one POST may carry. Default 20. */
  maxBatch?: number;
  /** Longest tool result, in characters, before it is refused as too large. Default 120,000. */
  maxResultChars?: number;
  tooLargeMessage?: string;
};

export const DEFAULT_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const RPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

type Id = string | number | null;
export type RpcResponse = {
  jsonrpc: "2.0";
  id: Id;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};
type Outcome = { result?: unknown; error?: [number, string] };

const ok = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
export const rpcError = (id: Id, code: number, message: string): RpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

/** The reply to a body that is not JSON at all. */
export const PARSE_ERROR = rpcError(null, RPC_ERRORS.parse, "Parse error: the body is not valid JSON.");

const requestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

function jsonSchemaOf(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Record<string, unknown>;
  return rest;
}

/** Problems that make a tool list unfit to publish: duplicates, missing output schemas, undocumented parameters. */
export function catalogProblems<Ctx extends BaseContext>(tools: McpToolDef<Ctx>[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const t of tools) {
    if (seen.has(t.name)) problems.push(`Tool "${t.name}" is listed twice.`);
    seen.add(t.name);
    if (!t.description.trim()) problems.push(`Tool "${t.name}" has no description.`);
    if (!t.output) {
      problems.push(`Tool "${t.name}" has no output schema.`);
      continue;
    }
    const out = jsonSchemaOf(t.output, "output");
    if (out.type !== "object") problems.push(`Tool "${t.name}" must return an object.`);
    const props = (jsonSchemaOf(t.input, "input").properties ?? {}) as Record<string, { description?: string }>;
    for (const [param, def] of Object.entries(props)) {
      if (!def.description) problems.push(`Tool "${t.name}" parameter "${param}" has no description.`);
    }
  }
  return problems;
}

export function createMcpServer<Ctx extends BaseContext>(options: McpServerOptions<Ctx>) {
  const versions = options.protocolVersions ?? DEFAULT_PROTOCOL_VERSIONS;
  const maxBatch = options.maxBatch ?? 20;
  const maxText = options.maxResultChars ?? 120_000;
  const resources = options.resources ?? [];
  const templates = options.resourceTemplates ?? [];
  const prompts = options.prompts ?? [];
  const byName = new Map(options.tools.map((t) => [t.name, t]));
  for (const t of options.tools) {
    // A missing output schema is a programming error: refuse to start rather than publish a half catalog.
    if (!t.output) throw new Error(`Tool "${t.name}" has no output schema.`);
  }

  const capabilities = {
    tools: { listChanged: false },
    ...((resources.length > 0 || templates.length > 0) && { resources: { listChanged: false } }),
    ...(prompts.length > 0 && { prompts: { listChanged: false } }),
  };

  let toolCache: ReturnType<typeof buildTools> | undefined;
  function buildTools() {
    return options.tools.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: jsonSchemaOf(t.input, "input"),
      outputSchema: jsonSchemaOf(t.output, "output"),
      annotations: {
        title: t.title,
        readOnlyHint: t.access === "read",
        destructiveHint: t.access === "write" ? Boolean(t.destructive) : false,
        idempotentHint: Boolean(t.idempotent),
        openWorldHint: false,
      },
    }));
  }
  /** The tool list as clients see it (a public server card can publish the same thing). */
  const toolDefinitions = () => {
    toolCache ??= buildTools();
    return toolCache;
  };
  const promptDefinitions = () =>
    prompts.map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args }));

  /** Everything a client can learn without calling a tool (for a stdio bridge or a directory). */
  const catalog = () => ({
    protocolVersions: [...versions],
    serverInfo: options.info,
    instructions: options.instructions,
    capabilities,
    tools: toolDefinitions(),
    resources,
    resourceTemplates: templates,
    prompts: promptDefinitions(),
  });

  const readOnlyMessage =
    options.readOnlyMessage ?? ((name: string) => `This token is read-only, so "${name}" is not allowed.`);
  const tooLarge = options.tooLargeMessage ?? "That result is too large to return. Ask for less.";

  async function callTool(params: unknown, ctx: Ctx): Promise<Outcome> {
    const p = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).optional() }).safeParse(params);
    if (!p.success)
      return { error: [RPC_ERRORS.invalidParams, "tools/call needs a tool name and an arguments object."] };
    const tool = byName.get(p.data.name);
    if (!tool) return { error: [RPC_ERRORS.invalidParams, `Unknown tool: ${p.data.name}`] };

    const textResult = (text: string, isError: boolean, structured?: unknown) => ({
      result: {
        content: [{ type: "text", text }],
        ...(structured !== undefined && { structuredContent: structured }),
        isError,
      },
    });

    // Fails closed: only an explicit "write" passes a write tool.
    if (tool.access === "write" && ctx.access !== "write") return textResult(readOnlyMessage(tool.name), true);
    const parsed = tool.input.safeParse(p.data.arguments ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      return textResult(`Invalid arguments. ${where}${issue?.message ?? "Check the tool's input schema."}`, true);
    }
    try {
      const out = await tool.run(parsed.data as never, ctx);
      const text = JSON.stringify(out ?? { ok: true }, null, 2);
      if (text.length > maxText) return textResult(tooLarge, true);
      const structured = out && typeof out === "object" && !Array.isArray(out) ? out : undefined;
      return textResult(text, false, structured);
    } catch (e) {
      return textResult(options.describeError(e), true);
    }
  }

  async function readResource(params: unknown, ctx: Ctx): Promise<Outcome> {
    const p = z.object({ uri: z.string() }).safeParse(params);
    if (!p.success) return { error: [RPC_ERRORS.invalidParams, "resources/read needs a uri."] };
    if (!options.readResource) return { error: [RPC_ERRORS.invalidParams, `Unknown resource ${p.data.uri}.`] };
    try {
      const data = await options.readResource(p.data.uri, ctx);
      return {
        result: {
          contents: [{ uri: p.data.uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
        },
      };
    } catch (e) {
      return { error: [RPC_ERRORS.invalidParams, options.describeError(e)] };
    }
  }

  function getPrompt(params: unknown): Outcome {
    const p = z.object({ name: z.string(), arguments: z.record(z.string(), z.string()).optional() }).safeParse(params);
    if (!p.success) return { error: [RPC_ERRORS.invalidParams, "prompts/get needs a prompt name."] };
    const prompt = prompts.find((x) => x.name === p.data.name);
    if (!prompt) return { error: [RPC_ERRORS.invalidParams, `Unknown prompt: ${p.data.name}`] };
    const args = p.data.arguments ?? {};
    const missing = prompt.arguments.filter((a) => a.required && !args[a.name]).map((a) => a.name);
    if (missing.length) return { error: [RPC_ERRORS.invalidParams, `Missing argument: ${missing.join(", ")}`] };
    return {
      result: {
        description: prompt.description,
        messages: [{ role: "user", content: { type: "text", text: prompt.build(args) } }],
      },
    };
  }

  async function dispatch(method: string, params: unknown, ctx: Ctx): Promise<Outcome> {
    switch (method) {
      case "initialize": {
        const asked = (params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
        const version = versions.find((v) => v === asked) ?? versions[0];
        return {
          result: {
            protocolVersion: version,
            capabilities,
            serverInfo: options.info,
            ...(options.instructions && { instructions: options.instructions }),
          },
        };
      }
      case "ping":
      case "logging/setLevel":
        return { result: {} };
      case "tools/list":
        return { result: { tools: toolDefinitions() } };
      case "tools/call":
        return callTool(params, ctx);
      case "resources/list":
        return { result: { resources } };
      case "resources/templates/list":
        return { result: { resourceTemplates: templates } };
      case "resources/read":
        return readResource(params, ctx);
      case "prompts/list":
        return { result: { prompts: promptDefinitions() } };
      case "prompts/get":
        return getPrompt(params);
      default:
        return { error: [RPC_ERRORS.methodNotFound, `Method not found: ${method}`] };
    }
  }

  async function handleOne(raw: unknown, ctx: Ctx): Promise<RpcResponse | null> {
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      // A response (has result/error) or junk. Nothing to answer unless it looked like a request with an id.
      const id = (raw as { id?: unknown } | null)?.id;
      if (raw && typeof raw === "object" && ("result" in raw || "error" in raw)) return null;
      return rpcError(
        typeof id === "string" || typeof id === "number" ? id : null,
        RPC_ERRORS.invalidRequest,
        "Not a valid JSON-RPC 2.0 request.",
      );
    }
    const { id, method, params } = parsed.data;
    if (id === undefined) return null; // a notification: no reply (initialized, cancelled, ...)
    try {
      const out = await dispatch(method, params, ctx);
      return out.error ? rpcError(id, out.error[0], out.error[1]) : ok(id, out.result ?? {});
    } catch (e) {
      options.onInternalError?.(e);
      return rpcError(id, RPC_ERRORS.internal, "Something went wrong. Please try again.");
    }
  }

  /** Handles a parsed POST body (one message or a batch). `body: undefined` means 202 with nothing to say. */
  async function handle(body: unknown, ctx: Ctx): Promise<{ status: number; body?: unknown }> {
    if (Array.isArray(body)) {
      if (body.length === 0) return { status: 400, body: rpcError(null, RPC_ERRORS.invalidRequest, "Empty batch.") };
      if (body.length > maxBatch) {
        return {
          status: 400,
          body: rpcError(null, RPC_ERRORS.invalidRequest, `Too many messages in one batch (at most ${maxBatch}).`),
        };
      }
      const replies = (await Promise.all(body.map((m) => handleOne(m, ctx)))).filter(
        (r): r is RpcResponse => r !== null,
      );
      return replies.length ? { status: 200, body: replies } : { status: 202 };
    }
    const reply = await handleOne(body, ctx);
    if (!reply) return { status: 202 };
    return { status: reply.error?.code === RPC_ERRORS.invalidRequest ? 400 : 200, body: reply };
  }

  return { handle, catalog, toolDefinitions, promptDefinitions, capabilities, versions, maxBatch };
}

export type McpServer<Ctx extends BaseContext> = ReturnType<typeof createMcpServer<Ctx>>;
