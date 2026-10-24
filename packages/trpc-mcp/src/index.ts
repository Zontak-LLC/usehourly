/**
 * Serve an app's existing procedures to AI assistants as a safe MCP server (Streamable HTTP,
 * stateless, JSON replies). Working name; see README.md for the public API and what is left.
 */
export {
  type AuthOutcome,
  createMcpHttpHandler,
  jsonResponse,
  type McpHttpOptions,
  originAllowed,
} from "./http";
export {
  type Access,
  type BaseContext,
  catalogProblems,
  createMcpServer,
  DEFAULT_PROTOCOL_VERSIONS,
  defineTool,
  type McpPrompt,
  type McpResource,
  type McpResourceTemplate,
  type McpServer,
  type McpServerOptions,
  type McpToolDef,
  PARSE_ERROR,
  RPC_ERRORS,
  type RpcResponse,
} from "./protocol";
