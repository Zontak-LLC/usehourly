import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { isDemoSession } from "@/lib/demo";
import { CURRENCY_CODES } from "@/lib/money";
import { isValidTimeZone, localParts, reminderTimePassed, weekKey } from "@/lib/reminder";
import { NO_PASSWORD_HASH } from "@/lib/social-login";
import { isThemeMode, isThemePreset } from "@/lib/theme-sync";

import { avatarSchema, logoSchema } from "../logo-schema";
import { protectedProcedure } from "../trpc";

export const profileProcedures = {
  /** Remembers the colour and light/dark choice so other devices open with it. Demo accounts keep it to the browser. */
  setTheme: protectedProcedure
    .input(
      z.object({
        preset: z.string().refine(isThemePreset, "Unknown colour.").optional(),
        mode: z.string().refine(isThemeMode, "Unknown mode.").optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (isDemoSession(ctx.session) || (!input.preset && !input.mode)) return { saved: false };
      await ctx.prisma.authUser.update({
        where: { id: ctx.userId },
        data: {
          ...(input.preset ? { theme_preset: input.preset } : {}),
          ...(input.mode ? { theme_mode: input.mode } : {}),
        },
      });
      return { saved: true };
    }),

  /**
   * The account's currency (issue #71, step 1). It changes how amounts are written, never the numbers (nothing is
   * converted), and it is locked once the account has an invoice: an invoice keeps its currency, and totals, the year
   * summary and the accounting export never mix two. Choosing the current one again is always fine.
   */
  setCurrency: protectedProcedure
    .input(z.object({ currency: z.enum(CURRENCY_CODES) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.authUser.findUnique({ where: { id: ctx.userId }, select: { currency: true } });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
      if (user.currency === input.currency) return { currency: user.currency };
      const invoices = await ctx.prisma.invoice.count({ where: { user_id: ctx.userId } });
      if (invoices > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Your currency is fixed once you have made an invoice, so your invoices and totals stay in one currency.",
        });
      }
      await ctx.prisma.authUser.update({ where: { id: ctx.userId }, data: { currency: input.currency } });
      return { currency: input.currency };
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
        invoice_branding: true,
        is_demo: true,
        weekly_reminder: true,
        currency: true,
        avatar: true,
        password_hash: true,
      },
    });
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
    // Accounts made with GitHub have no password until they choose one through "Forgot password".
    // The currency can be changed until the first invoice exists (see setCurrency).
    const currency_locked = (await ctx.prisma.invoice.count({ where: { user_id: ctx.userId } })) > 0;
    return {
      ...user,
      currency_locked,
      has_password: user.password_hash !== NO_PASSWORD_HASH && !user.is_demo,
      password_hash: undefined,
    };
  }),

  /**
   * Turn the Friday "log your hours" email on or off. Turning it on needs the email service to be set
   * up and the person's address to be confirmed (otherwise anyone could point it at someone else's
   * mailbox). The browser sends its time zone so "Friday afternoon" is the person's own. If this
   * week's time has already passed, the first email is next Friday, not in an hour.
   */
  setWeeklyReminder: protectedProcedure
    .input(z.object({ enabled: z.boolean(), timezone: z.string().max(64).optional() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.authUser.findUnique({
        where: { id: ctx.userId },
        select: { is_demo: true, email_verified_at: true, timezone: true },
      });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
      if (!input.enabled) {
        await ctx.prisma.authUser.update({ where: { id: ctx.userId }, data: { weekly_reminder: false } });
        return { enabled: false };
      }
      if (user.is_demo) throw new TRPCError({ code: "FORBIDDEN", message: "Create a free account first." });
      if (!ctx.mailer) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email isn't set up yet." });
      if (!user.email_verified_at) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Please confirm your email address first, using the link under your email above.",
        });
      }
      const timezone = input.timezone ?? user.timezone;
      if (!timezone || !isValidTimeZone(timezone)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "We couldn't tell your time zone. Please try again." });
      }
      const now = new Date();
      await ctx.prisma.authUser.update({
        where: { id: ctx.userId },
        data: {
          weekly_reminder: true,
          timezone,
          reminder_sent_week: reminderTimePassed(now, timezone) ? weekKey(localParts(now, timezone).date) : null,
        },
      });
      return { enabled: true };
    }),

  /** Show or hide "Made with UseHourly" on invoices issued from now on (issued ones never change). */
  setInvoiceBranding: protectedProcedure.input(z.object({ enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.authUser.update({ where: { id: ctx.userId }, data: { invoice_branding: input.enabled } });
    return { enabled: input.enabled };
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

  /** The person's picture, shown beside their name in the top bar. null removes it (initials show again). */
  setAvatar: protectedProcedure.input(z.object({ avatar: avatarSchema })).mutation(async ({ ctx, input }) => {
    if (isDemoSession(ctx.session)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Create a free account to add your picture." });
    }
    await ctx.prisma.authUser.update({ where: { id: ctx.userId }, data: { avatar: input.avatar } });
    return { saved: true };
  }),

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
};
