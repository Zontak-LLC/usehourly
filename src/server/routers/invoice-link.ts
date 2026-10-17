import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { isDemoSession } from "@/lib/demo";
import { hashToken, newToken } from "@/lib/email-token";
import {
  DEFAULT_LINK_EXPIRY_DAYS,
  LINK_EXPIRY_DAYS,
  linkStatus,
  MAX_LIVE_LINKS,
  MAX_LIVE_LINKS_PER_INVOICE,
} from "@/lib/invoice-link";

import { protectedProcedure, router } from "../trpc";

const nowSeconds = () => Math.floor(Date.now() / 1000);

export const invoiceLinkRouter = router({
  /**
   * Makes a private link to one of the account's invoices. The page it opens shows the invoice's frozen snapshot, so it
   * never changes after it is sent. The link is returned once: only its hash is stored.
   */
  create: protectedProcedure
    .input(
      z.object({
        invoiceId: z.string().max(100),
        expiresInDays: z
          .number()
          .refine((n) => (LINK_EXPIRY_DAYS as readonly number[]).includes(n), "Choose 30, 90 or 180 days.")
          .default(DEFAULT_LINK_EXPIRY_DAYS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (isDemoSession(ctx.session)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Create a free account to share invoices with clients." });
      }
      const invoice = await ctx.prisma.invoice.findFirst({
        where: { id: input.invoiceId, user_id: ctx.userId },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
      const now = nowSeconds();
      const live = { revoked_at: null, expires_at: { gt: now } };
      const [onInvoice, overall] = await Promise.all([
        ctx.prisma.invoiceLink.count({ where: { user_id: ctx.userId, invoice_id: invoice.id, ...live } }),
        ctx.prisma.invoiceLink.count({ where: { user_id: ctx.userId, ...live } }),
      ]);
      if (onInvoice >= MAX_LIVE_LINKS_PER_INVOICE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This invoice already has ${MAX_LIVE_LINKS_PER_INVOICE} live links. Turn one off first.`,
        });
      }
      if (overall >= MAX_LIVE_LINKS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You have ${MAX_LIVE_LINKS} live invoice links. Turn some off first.`,
        });
      }
      const token = newToken();
      const row = await ctx.prisma.invoiceLink.create({
        data: {
          user_id: ctx.userId,
          invoice_id: invoice.id,
          token_hash: await hashToken(token),
          token_prefix: token.slice(0, 6),
          expires_at: now + input.expiresInDays * 86_400,
        },
        select: { id: true },
      });
      return { id: row.id, token };
    }),

  /** The links on one invoice, newest first. */
  list: protectedProcedure.input(z.object({ invoiceId: z.string().max(100) })).query(async ({ ctx, input }) => {
    const now = nowSeconds();
    const rows = await ctx.prisma.invoiceLink.findMany({
      where: { user_id: ctx.userId, invoice_id: input.invoiceId },
      orderBy: { created_at: "desc" },
      take: 20,
      select: { id: true, token_prefix: true, created_at: true, expires_at: true, revoked_at: true },
    });
    return rows.map((r) => ({ ...r, status: linkStatus(r, now) }));
  }),

  /** Turns a link off; the page stops working at once. */
  revoke: protectedProcedure.input(z.object({ id: z.string().max(100) })).mutation(async ({ ctx, input }) => {
    const done = await ctx.prisma.invoiceLink.updateMany({
      where: { id: input.id, user_id: ctx.userId, revoked_at: null },
      data: { revoked_at: nowSeconds() },
    });
    if (done.count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "That link was not found." });
    return { revoked: true };
  }),
});
