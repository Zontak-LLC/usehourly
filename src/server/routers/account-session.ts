import { TRPCError } from "@trpc/server";
import { compare } from "bcryptjs";
import { z } from "zod";

import { isDemoSession } from "@/lib/demo";
import { normalizeEmail } from "@/lib/email";
import { CHANGE_PASSWORD_ATTEMPTS, clearRateLimit, describeWait, hitRateLimit } from "@/lib/rate-limit";
import { NO_PASSWORD_HASH } from "@/lib/social-login";

import { deleteAccountData } from "../account-deletion";
import { protectedProcedure } from "../trpc";

export const sessionProcedures = {
  /**
   * Deletes the account and all its data for good. Asks for the password (or, for an account that only
   * signs in with GitHub or Google, the email address typed out), and limits wrong tries like a password change.
   */
  deleteAccount: protectedProcedure
    .input(z.object({ confirm: z.string().min(1).max(254) }))
    .mutation(async ({ ctx, input }) => {
      if (isDemoSession(ctx.session)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sample accounts are removed automatically after a day. Create a real account to keep your data.",
        });
      }
      const user = await ctx.prisma.authUser.findUnique({ where: { id: ctx.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
      const attempts = await hitRateLimit(
        ctx.prisma,
        `delacct:${ctx.userId}`,
        CHANGE_PASSWORD_ATTEMPTS.limit,
        CHANGE_PASSWORD_ATTEMPTS.windowSeconds,
      );
      if (!attempts.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many tries. Please wait ${describeWait(attempts.retryAfterSeconds)} and try again.`,
        });
      }
      const confirmed =
        user.password_hash === NO_PASSWORD_HASH
          ? normalizeEmail(input.confirm) === user.email
          : await compare(input.confirm, user.password_hash);
      if (!confirmed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            user.password_hash === NO_PASSWORD_HASH ? "That isn't your email address." : "Password is incorrect.",
        });
      }
      await deleteAccountData(ctx.prisma, ctx.userId);
      await clearRateLimit(ctx.prisma, `delacct:${ctx.userId}`);
      return { deleted: true };
    }),

  /** Sign out every device, including this one. */
  signOutEverywhere: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.authUser.update({ where: { id: ctx.userId }, data: { token_version: { increment: 1 } } });
    return { ok: true };
  }),
};
