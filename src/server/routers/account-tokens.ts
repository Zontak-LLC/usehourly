import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  EXPIRY_CHOICES,
  expiryToEpoch,
  hashApiToken,
  MAX_TOKENS_PER_USER,
  newApiToken,
  tokenPrefix,
  tokenState,
} from "@/lib/api-token";
import { isDemoSession } from "@/lib/demo";

import { insertWithinQuota, liveTokens } from "../quota-insert";
import { protectedProcedure } from "../trpc";
import { nowSeconds } from "./account-shared";

// Access tokens for the MCP server (/api/mcp). Only a signed-in browser session can reach
// these; no MCP tool exposes them, so a token can never mint or revoke tokens.
export const tokenProcedures = {
  /** The user's tokens, newest first. The secret is never returned again after it is made. */
  listApiTokens: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.apiToken.findMany({
      where: { user_id: ctx.userId },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        access: true,
        expires_at: true,
        last_used_at: true,
        revoked_at: true,
        created_at: true,
      },
    });
    return rows.map((r) => ({ ...r, state: tokenState(r) }));
  }),

  /** Make a token. The returned `token` is shown once and only its hash is kept. */
  createApiToken: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, 'Give the token a name, like "Claude Code".').max(60),
        access: z.enum(["read", "write"]),
        expires: z.enum(EXPIRY_CHOICES.map((c) => c.key) as [string, ...string[]]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Refuse before touching the database; the stored flag is checked again below.
      if (isDemoSession(ctx.session)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Create a free account to connect an AI assistant." });
      }
      const user = await ctx.prisma.authUser.findUnique({
        where: { id: ctx.userId },
        select: { token_version: true, is_demo: true },
      });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
      if (user.is_demo) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Create a free account to connect an AI assistant." });
      }

      const token = newApiToken();
      // The live-token count and the insert are one statement, so two at once cannot both take the last place.
      const id = await insertWithinQuota(
        ctx.prisma,
        "api_tokens",
        {
          user_id: ctx.userId,
          name: input.name,
          token_hash: await hashApiToken(token),
          prefix: tokenPrefix(token),
          access: input.access,
          token_version: user.token_version,
          expires_at: expiryToEpoch(input.expires as (typeof EXPIRY_CHOICES)[number]["key"]),
        },
        {
          used: liveTokens(ctx.userId),
          limit: MAX_TOKENS_PER_USER,
          refuse: () =>
            new TRPCError({
              code: "BAD_REQUEST",
              message: `You can have ${MAX_TOKENS_PER_USER} active tokens. Revoke one you no longer use first.`,
            }),
        },
      );
      const row = await ctx.prisma.apiToken.findUniqueOrThrow({
        where: { id },
        select: { id: true, name: true, prefix: true, access: true, expires_at: true },
      });
      return { ...row, token };
    }),

  /** Stop a token from working, now. It stays in the list as "revoked". */
  revokeApiToken: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.prisma.apiToken.updateMany({
      where: { id: input.id, user_id: ctx.userId, revoked_at: null },
      data: { revoked_at: nowSeconds() },
    });
    if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Token not found." });
    return { ok: true };
  }),

  // Deleting is the one action the token list offers: the row goes, so the token stops working at once (the MCP check
  // finds no row for its hash) and the list keeps only tokens worth keeping. Only the caller's own tokens.
  deleteApiToken: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.prisma.apiToken.deleteMany({ where: { id: input.id, user_id: ctx.userId } });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Token not found." });
      return { ok: true };
    }),
};
