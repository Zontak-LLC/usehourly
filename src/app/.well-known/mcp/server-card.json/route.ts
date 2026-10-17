import { SERVER_INFO, SUPPORTED_VERSIONS, toolDefinitions } from "@/server/mcp/protocol";
import { PROMPTS, RESOURCES } from "@/server/mcp/tools";

/**
 * A public description of the MCP server for directories that cannot connect to it themselves
 * (the real endpoint needs a token). It carries no secrets: names, descriptions and input shapes.
 */
export function GET() {
  const card = {
    version: "1.0",
    protocolVersion: SUPPORTED_VERSIONS[0],
    serverInfo: SERVER_INFO,
    description:
      "Time tracking for freelancers: log and edit time, run timers, manage clients and projects, create invoices and read annual reports.",
    documentationUrl: "https://github.com/Zontak-LLC/usehourly#use-it-from-any-ai-assistant-mcp-server",
    transport: { type: "streamable-http", endpoint: "/api/mcp" },
    authentication: {
      required: true,
      schemes: ["bearer"],
      description: "Create a personal access token at usehourly.app under Account > AI assistants.",
    },
    capabilities: { tools: {}, resources: {}, prompts: {} },
    tools: toolDefinitions(),
    resources: RESOURCES,
    prompts: PROMPTS.map(({ name, title, description, arguments: args }) => ({
      name,
      title,
      description,
      arguments: args,
    })),
  };
  return Response.json(card, {
    headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
  });
}
