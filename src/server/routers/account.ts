import { TRPCError } from "@trpc/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";

import { normalizeEmail } from "@/lib/email";
import { describeWait, hitRateLimit, REGISTER_PER_IP } from "@/lib/rate-limit";

import { logoSchema } from "../logo-schema";
import { protectedProcedure, publicProcedure, router } from "../trpc";

export const accountRouter = router({
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

  /** Sign out every device, including this one. */
  signOutEverywhere: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.authUser.update({ where: { id: ctx.userId }, data: { token_version: { increment: 1 } } });
    return { ok: true };
  }),
});
