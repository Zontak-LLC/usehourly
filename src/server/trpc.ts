import type { PrismaClient } from "@prisma/client";
import { initTRPC, TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { ZodError } from "zod";

import type { Mailer } from "@/lib/mailer";

// Context is built in ./context.ts so this module stays free of next-auth/Prisma
// runtime imports and routers can be exercised directly in scenario tests.
// `ip` is the caller's address when known; register uses it to throttle sign-ups (absent in tests).
// `mailer` is null when no email service is configured (see src/lib/mailer.ts); `baseUrl` is used for
// links inside emails.
export type Context = {
  session: Session | null;
  prisma: PrismaClient;
  ip?: string | null;
  mailer?: Mailer | null;
  baseUrl?: string;
};

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    // Never leak raw Prisma/D1 messages; deliberate codes keep their user-safe text.
    if (error.code === "INTERNAL_SERVER_ERROR") {
      return { ...shape, message: "Something went wrong. Please try again." };
    }
    // Input validation: surface the first human message instead of zod's raw JSON issue list.
    if (error.cause instanceof ZodError) {
      return { ...shape, message: error.cause.issues[0]?.message ?? "That input isn't valid." };
    }
    return shape;
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/** Requires a signed-in user; injects ctx.userId. Every query MUST filter by it. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in." });
  return next({ ctx: { ...ctx, userId } });
});
