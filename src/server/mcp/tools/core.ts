import type { PrismaClient } from "@prisma/client";
import type { z } from "zod";

import { appRouter } from "../../routers/_app";
import { createCallerFactory } from "../../trpc";

const makeCaller = createCallerFactory(appRouter);
export type Caller = ReturnType<typeof makeCaller>;

export function callerFor(prisma: PrismaClient, userId: string): Caller {
  return makeCaller({ session: { user: { id: userId }, expires: "" }, prisma });
}

export type ToolContext = { prisma: PrismaClient; userId: string; access: "read" | "write" };

export type McpTool = {
  name: string;
  title: string;
  description: string;
  /** "write" tools are refused for read-only tokens. */
  access: "read" | "write";
  destructive?: boolean;
  idempotent?: boolean;
  input: z.ZodType;
  run: (c: Caller, args: never, x: ToolContext) => Promise<unknown>;
};

export function defineTool<S extends z.ZodType>(t: {
  name: string;
  title: string;
  description: string;
  access: "read" | "write";
  destructive?: boolean;
  idempotent?: boolean;
  input: S;
  run: (c: Caller, args: z.infer<S>, x: ToolContext) => Promise<unknown>;
}): McpTool {
  return t as unknown as McpTool;
}
