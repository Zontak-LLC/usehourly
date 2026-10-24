import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { isDemoSession } from "@/lib/demo";
import { emailField } from "@/lib/email";
import { CURRENCY_CODES, effectiveCurrency } from "@/lib/money";
import { DEFAULT_CLIENT_COLOR } from "@/lib/palette";
import { assertWithinQuota } from "@/lib/quotas";
import { roundingSchema } from "@/lib/rounding";

import { logoSchema } from "../logo-schema";
import { protectedProcedure, router } from "../trpc";

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * A client's currency can change until it has an invoice: an invoice keeps the currency it was issued in, and the
 * client's rates, budgets and totals must not switch currency underneath it. Saving the same effective currency again
 * is always fine (the form sends it on every save).
 */
async function assertCurrencyChangeAllowed(
  ctx: { prisma: PrismaClient; userId: string },
  existing: { id: string; currency: string | null },
  next: string | null,
) {
  const user = await ctx.prisma.authUser.findUnique({ where: { id: ctx.userId }, select: { currency: true } });
  if (effectiveCurrency(existing.currency, user?.currency) === effectiveCurrency(next, user?.currency)) return;
  const invoices = await ctx.prisma.invoice.count({ where: { user_id: ctx.userId, client_id: existing.id } });
  if (invoices > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This client's currency is fixed once you have made an invoice for it, so its invoices stay in one currency.",
    });
  }
}

export const clientRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.client.findMany({
      where: { user_id: ctx.userId, archived: false },
      // The logo can be hundreds of KB and this list loads on every page; fetch it via `get`.
      omit: { logo: true },
      include: { projects: { where: { archived: false }, omit: { logo: true }, orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    }),
  ),

  /** Archived clients, so they can be restored. */
  listArchived: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.client.findMany({
      where: { user_id: ctx.userId, archived: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ),

  /** {clientId: dataUrl} for clients that have a logo: one small query shared by every view that shows them. */
  logos: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.client.findMany({
      where: { user_id: ctx.userId, logo: { not: null } },
      select: { id: true, logo: true },
    });
    return Object.fromEntries(rows.flatMap((r) => (r.logo ? [[r.id, r.logo] as const] : [])));
  }),

  /** Set (or clear, with null) one client's logo without touching its billing details. */
  setLogo: protectedProcedure.input(z.object({ id: z.string(), logo: logoSchema })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.prisma.client.updateMany({
      where: { id: input.id, user_id: ctx.userId },
      data: { logo: input.logo },
    });
    if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
    return { ok: true };
  }),

  /** One client's billing details, including the logo (not in `list`). */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const c = await ctx.prisma.client.findFirst({
      where: { id: input.id, user_id: ctx.userId },
      select: {
        id: true,
        name: true,
        legal_name: true,
        address: true,
        email: true,
        logo: true,
        round_step: true,
        round_mode: true,
        round_min: true,
        currency: true,
      },
    });
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
    // The currency is fixed once the client has an invoice (see assertCurrencyChangeAllowed).
    const invoices = await ctx.prisma.invoice.count({ where: { user_id: ctx.userId, client_id: c.id } });
    return { ...c, currency_locked: invoices > 0 };
  }),

  /** Rename and set the billing address / logo printed on this client's invoices. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(80),
        legalName: z.string().trim().max(150),
        address: z.string().trim().max(300),
        // Where this client's invoices are sent. Left out = unchanged; empty = removed.
        email: z.union([z.literal(""), emailField]).optional(),
        // Billing rounding for this client's invoices. Left out = unchanged.
        rounding: roundingSchema.optional(),
        // This client's billing currency. Left out = unchanged; null = use the account's currency (issue #71 step 2).
        currency: z.enum(CURRENCY_CODES).nullable().optional(),
        logo: logoSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.client.findFirst({ where: { id: input.id, user_id: ctx.userId } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
      if (input.name !== existing.name) {
        const dup = await ctx.prisma.client.findFirst({ where: { user_id: ctx.userId, name: input.name } });
        if (dup) throw new TRPCError({ code: "CONFLICT", message: `You already have a client named "${input.name}".` });
      }
      if (input.currency !== undefined) await assertCurrencyChangeAllowed(ctx, existing, input.currency);
      return ctx.prisma.client.update({
        where: { id: input.id, user_id: ctx.userId },
        data: {
          name: input.name,
          ...(input.currency === undefined ? {} : { currency: input.currency }),
          legal_name: input.legalName || null,
          address: input.address || null,
          ...(input.email === undefined ? {} : { email: input.email || null }),
          ...(input.rounding
            ? { round_step: input.rounding.step, round_mode: input.rounding.mode, round_min: input.rounding.min }
            : {}),
          logo: input.logo,
        },
        select: { id: true },
      });
    }),

  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(80), color: colorSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const dup = await ctx.prisma.client.findFirst({ where: { user_id: ctx.userId, name: input.name } });
      if (dup) throw new TRPCError({ code: "CONFLICT", message: `You already have a client named "${input.name}".` });
      assertWithinQuota(
        await ctx.prisma.client.count({ where: { user_id: ctx.userId } }),
        1,
        "clients",
        isDemoSession(ctx.session),
      );
      return ctx.prisma.client.create({
        data: { user_id: ctx.userId, ...input, color: input.color ?? DEFAULT_CLIENT_COLOR },
      });
    }),

  archive: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.prisma.client.updateMany({
      where: { id: input.id, user_id: ctx.userId },
      data: { archived: true },
    });
    if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
    return { ok: true };
  }),

  unarchive: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.prisma.client.updateMany({
      where: { id: input.id, user_id: ctx.userId },
      data: { archived: false },
    });
    if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
    return { ok: true };
  }),
});
