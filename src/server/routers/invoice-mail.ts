import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { LINK_EXPIRY_DAYS } from "@/lib/invoice-link";
import { MAX_INVOICE_NOTE, senderBlocker } from "@/lib/invoice-mail";
import { appUrl } from "@/lib/mailer";

import { deliverInvoiceEmail, InvoiceMailError } from "../invoice-mail";
import { protectedProcedure, router } from "../trpc";

export const invoiceMailRouter = router({
  /** What the "Email it" panel needs: who it would go to, what was already sent, and why sending is blocked, if it is. */
  recipient: protectedProcedure.input(z.object({ invoiceId: z.string().max(100) })).query(async ({ ctx, input }) => {
    const invoice = await ctx.prisma.invoice.findFirst({
      where: { id: input.invoiceId, user_id: ctx.userId },
      select: {
        id: true,
        client_id: true,
        due_date: true,
        paid_date: true,
        remind_overdue: true,
        reminders_sent: true,
      },
    });
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
    const [client, history, owner] = await Promise.all([
      invoice.client_id
        ? ctx.prisma.client.findFirst({
            where: { id: invoice.client_id, user_id: ctx.userId },
            select: { name: true, email: true },
          })
        : null,
      ctx.prisma.invoiceEmail.findMany({
        where: { user_id: ctx.userId, invoice_id: invoice.id },
        orderBy: { created_at: "desc" },
        take: 10,
        select: { kind: true, to_email: true, created_at: true },
      }),
      ctx.prisma.authUser.findUnique({
        where: { id: ctx.userId },
        select: { email_verified_at: true, email_bounced_at: true, is_demo: true, created_at: true },
      }),
    ]);
    const blocked = !ctx.mailer
      ? "Email isn't set up on this server yet."
      : owner
        ? senderBlocker(owner, new Date())
        : "Account not found.";
    return {
      clientName: client?.name ?? null,
      email: client?.email ?? null,
      dueDate: invoice.due_date,
      paid: invoice.paid_date !== null,
      remindOverdue: invoice.remind_overdue,
      remindersSent: invoice.reminders_sent,
      history,
      blocked,
    };
  }),

  /** Emails the invoice to the client with a fresh private link. Every guard lives in `deliverInvoiceEmail`. */
  send: protectedProcedure
    .input(
      z.object({
        invoiceId: z.string().max(100),
        note: z.string().trim().max(MAX_INVOICE_NOTE).optional(),
        expiresInDays: z
          .number()
          .refine((n) => (LINK_EXPIRY_DAYS as readonly number[]).includes(n), "Choose 30, 90 or 180 days.")
          .default(90),
        remindOverdue: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.remindOverdue) {
        const inv = await ctx.prisma.invoice.findFirst({
          where: { id: input.invoiceId, user_id: ctx.userId },
          select: { due_date: true },
        });
        if (inv && inv.due_date === null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Reminders need a due date on the invoice." });
        }
      }
      let sent: { to: string };
      try {
        sent = await deliverInvoiceEmail({
          prisma: ctx.prisma,
          mailer: ctx.mailer ?? null,
          userId: ctx.userId,
          invoiceId: input.invoiceId,
          kind: "invoice",
          note: input.note || null,
          linkDays: input.expiresInDays,
          appUrl: ctx.baseUrl ?? appUrl(),
          secret: process.env.AUTH_SECRET ?? "",
        });
      } catch (err) {
        if (err instanceof InvoiceMailError) throw new TRPCError({ code: err.code, message: err.message });
        throw err;
      }
      await ctx.prisma.invoice.updateMany({
        where: { id: input.invoiceId, user_id: ctx.userId },
        data: { remind_overdue: input.remindOverdue },
      });
      return { to: sent.to };
    }),

  /** Turn the overdue reminders for one invoice on or off. */
  setReminders: protectedProcedure
    .input(z.object({ invoiceId: z.string().max(100), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const inv = await ctx.prisma.invoice.findFirst({
        where: { id: input.invoiceId, user_id: ctx.userId },
        select: { due_date: true },
      });
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
      if (input.enabled && inv.due_date === null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reminders need a due date on the invoice." });
      }
      await ctx.prisma.invoice.updateMany({
        where: { id: input.invoiceId, user_id: ctx.userId },
        data: { remind_overdue: input.enabled },
      });
      return { enabled: input.enabled };
    }),
});
