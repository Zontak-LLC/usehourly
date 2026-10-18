import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";

import { logError } from "@/lib/log";

/** A tool failure as text the model can act on. Raw database messages never leave the server. */
export function describeError(e: unknown): string {
  if (e instanceof TRPCError) {
    if (e.code === "INTERNAL_SERVER_ERROR") {
      logError("mcp_tool_error", e);
      return "Something went wrong. Please try again.";
    }
    if (e.cause instanceof ZodError) return e.cause.issues[0]?.message ?? "That input isn't valid.";
    return e.message;
  }
  logError("mcp_tool_error", e);
  return "Something went wrong. Please try again.";
}
