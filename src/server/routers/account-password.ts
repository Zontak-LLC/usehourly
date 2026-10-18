import { TRPCError } from "@trpc/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";

import { emailField, normalizeEmail } from "@/lib/email";
import {
  CHANGE_PASSWORD_ATTEMPTS,
  clearRateLimit,
  describeWait,
  hitRateLimit,
  RESET_PER_EMAIL,
  RESET_PER_EMAIL_AND_IP,
  RESET_PER_IP,
} from "@/lib/rate-limit";
import { NO_PASSWORD_HASH } from "@/lib/social-login";

import { protectedProcedure, publicProcedure } from "../trpc";
import { findLiveToken, issueEmailToken, LINK_PROBLEM, nowSeconds } from "./account-shared";

export const passwordProcedures = {
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters.").max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.authUser.findUnique({ where: { id: ctx.userId } });
      if (user?.password_hash === NO_PASSWORD_HASH) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            'This account signs in with GitHub or Google and has no password. Use "Forgot password" on the login page to set one.',
        });
      }
      // A stolen session must not be able to guess the current password at the speed of the write limit.
      const attempts = await hitRateLimit(
        ctx.prisma,
        `chpw:${ctx.userId}`,
        CHANGE_PASSWORD_ATTEMPTS.limit,
        CHANGE_PASSWORD_ATTEMPTS.windowSeconds,
      );
      if (!attempts.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many tries. Please wait ${describeWait(attempts.retryAfterSeconds)} and try again.`,
        });
      }
      if (!user || !(await compare(input.currentPassword, user.password_hash))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Current password is incorrect." });
      }
      await clearRateLimit(ctx.prisma, `chpw:${ctx.userId}`);
      await ctx.prisma.authUser.update({
        where: { id: ctx.userId },
        // Bumping token_version signs out every device, including this one; the browser signs
        // itself straight back in with the new password.
        data: { password_hash: await hash(input.newPassword, 10), token_version: { increment: 1 } },
      });
      return { ok: true };
    }),

  /** Email a sign-in-free link to choose a new password. Always answers the same, so it cannot be used to probe for accounts. */
  requestPasswordReset: publicProcedure.input(z.object({ email: emailField })).mutation(async ({ ctx, input }) => {
    if (!ctx.mailer) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Password reset by email isn't set up yet. Please write to the site owner.",
      });
    }
    const email = normalizeEmail(input.email);
    // Check the connection first, so a flood of made-up addresses from one place does not fill the table or
    // use up the real owner's allowance. The per-address ceilings only stop mail-bombing: a stranger
    // asking again and again from one connection is stopped by the connection limits, not by locking
    // the address for everyone.
    const checks = [
      ...(ctx.ip
        ? [
            { key: `reset:ip:${ctx.ip}`, ...RESET_PER_IP },
            { key: `reset:pair:${email}|${ctx.ip}`, ...RESET_PER_EMAIL_AND_IP },
          ]
        : []),
      { key: `reset:email:${email}`, ...RESET_PER_EMAIL },
    ];
    for (const c of checks) {
      const r = await hitRateLimit(ctx.prisma, c.key, c.limit, c.windowSeconds);
      if (!r.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many reset requests. Please try again in ${describeWait(r.retryAfterSeconds)}.`,
        });
      }
    }
    const user = await ctx.prisma.authUser.findUnique({ where: { email } });
    if (user) {
      try {
        await issueEmailToken(ctx, { id: user.id, email: user.email }, "reset");
      } catch (err) {
        console.error("password reset email failed:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't send the email. Please try again." });
      }
    }
    return { ok: true };
  }),

  /** Choose a new password with a link from the email. Signs every device out. */
  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(20).max(200),
        newPassword: z.string().min(8, "Password must be at least 8 characters.").max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.ip) {
        const r = await hitRateLimit(ctx.prisma, `reset-use:${ctx.ip}`, 10, 60 * 60);
        if (!r.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Please try again later." });
        }
      }
      const row = await findLiveToken(ctx, input.token, "reset");
      if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: LINK_PROBLEM });
      await ctx.prisma.authUser.update({
        where: { id: row.user_id },
        data: {
          password_hash: await hash(input.newPassword, 10),
          token_version: { increment: 1 },
          // Opening the link proves they control the address.
          email_verified_at: new Date(),
        },
      });
      await ctx.prisma.emailToken.update({ where: { id: row.id }, data: { used_at: nowSeconds() } });
      return { ok: true };
    }),
};
