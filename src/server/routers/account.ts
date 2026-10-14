import { TRPCError } from "@trpc/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";

import { normalizeEmail } from "@/lib/email";
import { hashToken, newToken, RESET_TTL_SECONDS, VERIFY_TTL_SECONDS } from "@/lib/email-token";
import { resetPasswordMessage, verifyEmailMessage } from "@/lib/mailer";
import { describeWait, hitRateLimit, REGISTER_PER_IP } from "@/lib/rate-limit";

import { logoSchema } from "../logo-schema";
import { type Context, protectedProcedure, publicProcedure, router } from "../trpc";

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Create a one-time token for the user, replacing any unused one of the same kind, and email it. */
async function issueEmailToken(
  ctx: Pick<Context, "prisma" | "mailer" | "baseUrl">,
  user: { id: string; email: string },
  kind: "verify" | "reset",
) {
  const mailer = ctx.mailer;
  if (!mailer) return false;
  const token = newToken();
  await ctx.prisma.emailToken.deleteMany({ where: { user_id: user.id, kind, used_at: null } });
  await ctx.prisma.emailToken.create({
    data: {
      user_id: user.id,
      kind,
      token_hash: await hashToken(token),
      expires_at: nowSeconds() + (kind === "reset" ? RESET_TTL_SECONDS : VERIFY_TTL_SECONDS),
    },
  });
  const base = ctx.baseUrl ?? "";
  const link =
    kind === "reset"
      ? `${base}/reset-password?token=${encodeURIComponent(token)}`
      : `${base}/verify-email?token=${encodeURIComponent(token)}`;
  await mailer.send(kind === "reset" ? resetPasswordMessage(user.email, link) : verifyEmailMessage(user.email, link));
  return true;
}

/** An unused, unexpired token of this kind, or null. */
async function findLiveToken(ctx: Pick<Context, "prisma">, token: string, kind: "verify" | "reset") {
  const row = await ctx.prisma.emailToken.findUnique({ where: { token_hash: await hashToken(token) } });
  if (!row || row.kind !== kind || row.used_at !== null || row.expires_at <= nowSeconds()) return null;
  return row;
}

const LINK_PROBLEM = "This link has expired or was already used. Please request a new one.";

export const accountRouter = router({
  /** Whether this installation can send email. Pages use it to say so plainly when it cannot. */
  emailEnabled: publicProcedure.query(({ ctx }) => ({ enabled: Boolean(ctx.mailer) })),

  register: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(8, "Password must be at least 8 characters.").max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.ip) {
        const r = await hitRateLimit(
          ctx.prisma,
          `register:${ctx.ip}`,
          REGISTER_PER_IP.limit,
          REGISTER_PER_IP.windowSeconds,
        );
        if (!r.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many sign-ups from this connection. Please try again in ${describeWait(r.retryAfterSeconds)}.`,
          });
        }
      }
      const email = normalizeEmail(input.email);
      const existing = await ctx.prisma.authUser.findUnique({ where: { email } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists." });
      const user = await ctx.prisma.authUser.create({
        data: { name: input.name, email, password_hash: await hash(input.password, 10) },
      });
      // Best effort: the account works without it, and the Account page can send it again.
      try {
        await issueEmailToken(ctx, { id: user.id, email }, "verify");
      } catch (err) {
        console.error("verification email failed:", err);
      }
      return { id: user.id };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.authUser.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        name: true,
        email: true,
        created_at: true,
        business_name: true,
        ein: true,
        address: true,
        logo: true,
        payment_instructions: true,
        email_verified_at: true,
      },
    });
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
    return user;
  }),

  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(80) }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.authUser.update({
        where: { id: ctx.userId },
        data: { name: input.name },
        select: { id: true, name: true, email: true },
      }),
    ),

  /** Business details printed on invoices. Empty strings clear a field. */
  updateBusiness: protectedProcedure
    .input(
      z.object({
        businessName: z.string().trim().max(100),
        // Forgiving input ("12 3456789", "EIN 12-3456789"): keep the digits, require exactly nine.
        ein: z
          .string()
          .transform((v) => v.replace(/\D/g, ""))
          .refine((v) => v === "" || v.length === 9, "An EIN has 9 digits, e.g. 12-3456789."),
        address: z.string().trim().max(300),
        paymentInstructions: z.string().trim().max(500).default(""),
        logo: logoSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.prisma.authUser.update({
        where: { id: ctx.userId },
        data: {
          business_name: input.businessName || null,
          ein: input.ein ? `${input.ein.slice(0, 2)}-${input.ein.slice(2)}` : null,
          address: input.address || null,
          logo: input.logo,
          payment_instructions: input.paymentInstructions || null,
        },
        select: { id: true },
      }),
    ),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters.").max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.authUser.findUnique({ where: { id: ctx.userId } });
      if (!user || !(await compare(input.currentPassword, user.password_hash))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Current password is incorrect." });
      }
      await ctx.prisma.authUser.update({
        where: { id: ctx.userId },
        // Bumping token_version signs out every device, including this one; the browser signs
        // itself straight back in with the new password.
        data: { password_hash: await hash(input.newPassword, 10), token_version: { increment: 1 } },
      });
      return { ok: true };
    }),

  /** Email a sign-in-free link to choose a new password. Always answers the same, so it cannot be used to probe for accounts. */
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.mailer) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Password reset by email isn't set up yet. Please write to the site owner.",
        });
      }
      const email = normalizeEmail(input.email);
      const keys = [`reset:email:${email}`, ...(ctx.ip ? [`reset:ip:${ctx.ip}`] : [])];
      for (const key of keys) {
        const r = await hitRateLimit(ctx.prisma, key, 5, 60 * 60);
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

  /** Email a link that confirms the signed-in user's address. */
  sendVerification: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.mailer) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email isn't set up yet." });
    }
    const user = await ctx.prisma.authUser.findUnique({ where: { id: ctx.userId } });
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
    if (user.email_verified_at) return { ok: true, alreadyVerified: true };
    const r = await hitRateLimit(ctx.prisma, `verify:${user.id}`, 3, 60 * 60);
    if (!r.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Please wait ${describeWait(r.retryAfterSeconds)} before asking for another email.`,
      });
    }
    try {
      await issueEmailToken(ctx, { id: user.id, email: user.email }, "verify");
    } catch (err) {
      console.error("verification email failed:", err);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't send the email. Please try again." });
    }
    return { ok: true, alreadyVerified: false };
  }),

  /** Confirm an address with a link from the email. Works whether or not the user is signed in. */
  verifyEmail: publicProcedure
    .input(z.object({ token: z.string().min(20).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const row = await findLiveToken(ctx, input.token, "verify");
      if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: LINK_PROBLEM });
      await ctx.prisma.authUser.update({ where: { id: row.user_id }, data: { email_verified_at: new Date() } });
      await ctx.prisma.emailToken.update({ where: { id: row.id }, data: { used_at: nowSeconds() } });
      return { ok: true };
    }),

  /** Sign out every device, including this one. */
  signOutEverywhere: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.authUser.update({ where: { id: ctx.userId }, data: { token_version: { increment: 1 } } });
    return { ok: true };
  }),
});
