import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";

/** A tool failure as text the model can act on. Raw database messages never leave the server. */
export function describeError(e: unknown): string {
  if (e instanceof TRPCError) {
    if (e.code === "INTERNAL_SERVER_ERROR") {
      console.error("MCP tool error:", e);
      return "Something went wrong. Please try again.";
    }
    if (e.cause instanceof ZodError) return e.cause.issues[0]?.message ?? "That input isn't valid.";
    return e.message;
  }
  console.error("MCP tool error:", e);
  return "Something went wrong. Please try again.";
}
