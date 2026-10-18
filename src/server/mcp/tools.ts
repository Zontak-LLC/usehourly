import { TRPCError } from "@trpc/server";

import { CLIENT_PROJECT_TOOLS } from "./tools/client-project-tools";
import type { Caller, McpTool, ToolContext } from "./tools/core";
import { INVOICE_READ_TOOLS, INVOICE_WRITE_TOOLS } from "./tools/invoice-tools";
import { listProjects } from "./tools/lookup";
import { READ_TOOLS } from "./tools/read-tools";
import { TIME_TOOLS } from "./tools/time-tools";

/**
 * The tools the MCP server offers. Every tool calls the same tRPC procedures the website uses,
 * as the token's owner, so business rules (ownership checks, duplicate names, invoice math) live
 * in one place and a token can never reach another account's data.
 *
 * Conventions for the model that reads these descriptions:
 * - Dates are the user's local calendar dates (YYYY-MM-DD). The server runs in UTC and cannot know
 *   the user's "today", so write tools always take the date explicitly.
 * - Time is whole minutes. Money arrives and leaves in dollars (stored as cents).
 * - Projects can be named as "Client / Project" instead of by id.
 */

export type { Caller, McpTool, ToolContext } from "./tools/core";
export { callerFor } from "./tools/core";
export { describeError } from "./tools/errors";
export { PROMPTS, RESOURCE_TEMPLATES, RESOURCES } from "./tools/resources";

export const TOOLS: McpTool[] = [
  ...READ_TOOLS,
  ...INVOICE_READ_TOOLS,
  ...TIME_TOOLS,
  ...CLIENT_PROJECT_TOOLS,
  ...INVOICE_WRITE_TOOLS,
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export async function readResource(c: Caller, uri: string): Promise<unknown> {
  if (uri === "usehourly://projects") return { projects: await listProjects(c) };
  if (uri === "usehourly://timer")
    return TOOLS_BY_NAME.get("get_running_timer")?.run(c, {} as never, { access: "read" } as ToolContext);
  const m = /^usehourly:\/\/entries\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(uri);
  if (m)
    return TOOLS_BY_NAME.get("list_entries")?.run(
      c,
      { from: m[1], to: m[2] } as never,
      { access: "read" } as ToolContext,
    );
  throw new TRPCError({ code: "NOT_FOUND", message: `Unknown resource ${uri}.` });
}
