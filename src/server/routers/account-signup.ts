import { TRPCError } from "@trpc/server";
import { hash } from "bcryptjs";
import { z } from "zod";

import { isDemoEmail } from "@/lib/demo";
import { emailField, normalizeEmail } from "@/lib/email";
import { describeWait, hitRateLimit, REGISTER_PER_IP } from "@/lib/rate-limit";
import { turnstileEnabled, turnstileSiteKey, verifyTurnstile } from "@/lib/turnstile";

import { protectedProcedure, publicProcedure } from "../trpc";
import { findLiveToken, issueEmailToken, LINK_PROBLEM, nowSeconds } from "./account-shared";

export const signupProcedures = {
  /** Whether this installation can send email. Pages use it to say so plainly when it cannot. */
  emailEnabled: publicProcedure.query(({ ctx }) => ({ enabled: Boolean(ctx.mailer) })),

  /** Which "Continue with ..." buttons the login pages should offer. */
  socialEnabled: publicProcedure.query(() => ({
    github: Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  })),

  /** The public key for the sign-up robot check, or null when it is not set up (the form then shows no widget). */
  signupCheck: publicProcedure.query(() => ({ siteKey: turnstileEnabled() ? turnstileSiteKey() : null })),

  register: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        email: emailField,
        password: z.string().min(8, "Password must be at least 8 characters.").max(200),
        // A box people never see: only a script fills it in.
        website: z.string().max(200).optional(),
        captcha: z.string().max(4096).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.website) throw new TRPCError({ code: "BAD_REQUEST", message: "Couldn't create your account." });
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
      if (turnstileEnabled() && !(await verifyTurnstile(input.captcha, ctx.ip))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Please confirm you're not a robot, then try again.",
        });
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

  /**
   * Turn the signed-in demo account into a real one: your own name, email and password. The sample
   * data can be wiped for a fresh start or kept. Signs every device out, so the page signs back in.
   */
  claimDemo: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        email: emailField,
        password: z.string().min(8, "Password must be at least 8 characters.").max(200),
        startFresh: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.ip) {
        const r = await hitRateLimit(
          ctx.prisma,
          `claim:${ctx.ip}`,
          REGISTER_PER_IP.limit,
          REGISTER_PER_IP.windowSeconds,
        );
        if (!r.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many attempts. Please try again in ${describeWait(r.retryAfterSeconds)}.`,
          });
        }
      }
      // Trust the database, not the sign-in token, about whether this is a demo.
      const me = await ctx.prisma.authUser.findUnique({ where: { id: ctx.userId }, select: { is_demo: true } });
      if (!me?.is_demo) throw new TRPCError({ code: "BAD_REQUEST", message: "This is already a full account." });
      const email = normalizeEmail(input.email);
      if (isDemoEmail(email))
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please use your own email address." });
      const taken = await ctx.prisma.authUser.findUnique({ where: { email } });
      if (taken) throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists." });

      if (input.startFresh) {
        // Children first; the sample data is all this account has.
        await ctx.prisma.invoice.deleteMany({ where: { user_id: ctx.userId } });
        await ctx.prisma.timeEntry.deleteMany({ where: { user_id: ctx.userId } });
        await ctx.prisma.project.deleteMany({ where: { user_id: ctx.userId } });
        await ctx.prisma.client.deleteMany({ where: { user_id: ctx.userId } });
      }
      try {
        await ctx.prisma.authUser.update({
          where: { id: ctx.userId },
          data: {
            name: input.name,
            email,
            password_hash: await hash(input.password, 10),
            is_demo: false,
            token_version: { increment: 1 },
            // The sample business details were placeholders.
            business_name: null,
            ein: null,
            address: null,
            payment_instructions: null,
          },
        });
      } catch (e) {
        if ((e as { code?: string } | null)?.code === "P2002") {
          throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists." });
        }
        throw e;
      }
      // Best effort, like sign-up: the account works without it.
      try {
        await issueEmailToken(ctx, { id: ctx.userId, email }, "verify");
      } catch (err) {
        console.error("verification email failed:", err);
      }
      return { ok: true };
    }),

  /** Email a link that confirms the signed-in user's address. */
  sendVerification: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.mailer) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email isn't set up yet." });
    }
    const user = await ctx.prisma.authUser.findUnique({ where: { id: ctx.userId } });
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
    if (user.is_demo) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Create your account first, then confirm your email." });
    }
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
};
