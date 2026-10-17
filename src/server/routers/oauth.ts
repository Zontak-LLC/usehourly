import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { appUrl } from "@/lib/mailer";

import { checkAuthorizeRequest, decideAuthorization } from "../oauth";
import { protectedProcedure, router } from "../trpc";

const params = z.object({
  response_type: z.string().max(40).optional(),
  client_id: z.string().max(100).optional(),
  redirect_uri: z.string().max(500).optional(),
  code_challenge: z.string().max(200).optional(),
  code_challenge_method: z.string().max(20).optional(),
  state: z.string().max(600).optional(),
  scope: z.string().max(200).optional(),
  resource: z.string().max(300).optional(),
});

async function refuseDemo(ctx: { prisma: PrismaClient; userId: string }) {
  const me = await ctx.prisma.authUser.findUnique({
    where: { id: ctx.userId },
    select: { is_demo: true, email: true },
  });
  if (!me) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
  if (me.is_demo) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Create a free account first, then connect your AI assistant." });
  }
  return me;
}

export const oauthRouter = router({
  /** What the consent screen shows. Needs a signed-in user; the page sends everyone else to log in. */
  inspect: protectedProcedure.input(params).query(async ({ ctx, input }) => {
    const me = await refuseDemo(ctx);
    const check = await checkAuthorizeRequest(ctx.prisma, input, appUrl());
    if (check.kind === "ok") {
      return {
        kind: "ok" as const,
        clientName: check.clientName,
        redirectHost: check.redirectHost,
        redirectUri: check.redirectUri,
        requested: check.requested,
        email: me.email,
      };
    }
    return check;
  }),

  decide: protectedProcedure
    .input(z.object({ params, allow: z.boolean(), access: z.enum(["read", "write"]) }))
    .mutation(async ({ ctx, input }) => {
      await refuseDemo(ctx);
      const res = await decideAuthorization(ctx.prisma, ctx.userId, input.params, input, appUrl());
      if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: res.message });
      return { redirectUrl: res.redirectUrl };
    }),
});
