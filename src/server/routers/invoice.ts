import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { DATE_RE } from "@/lib/dates";
import { buildInvoice, buildSearchText, type InvoiceSnapshot } from "@/lib/invoice";

import { protectedProcedure, router } from "../trpc";

const dateSchema = z.string().regex(DATE_RE, "Use YYYY-MM-DD");

const summary = {
  id: true,
  client_id: true,
  client_name: true,
  number: true,
  issue_date: true,
  due_date: true,
  paid_date: true,
  period_from: true,
  period_to: true,
  total_minutes: true,
  total_cents: true,
  notes: true,
  created_at: true,
} as const;

export const invoiceRouter = router({
  /** History. `q` matches number, client, notes, project names and entry notes (case-insensitive). */
  list: protectedProcedure
    .input(
      z
        .object({
          q: z.string().trim().max(100).optional(),
          clientId: z.string().optional(),
          status: z.enum(["all", "unpaid", "paid"]).optional(),
          // Issue date range (inclusive, YYYY-MM-DD) and the order of the results.
          from: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          to: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          sort: z.enum(["newest", "oldest", "highest", "lowest"]).optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.prisma.invoice.findMany({
        where: {
          user_id: ctx.userId,
          ...((input?.from || input?.to) && {
            issue_date: { ...(input.from && { gte: input.from }), ...(input.to && { lte: input.to }) },
          }),
          ...(input?.clientId && { client_id: input.clientId }),
          ...(input?.status === "paid" && { paid_date: { not: null } }),
          ...(input?.status === "unpaid" && { paid_date: null }),
          ...(input?.q && { search_text: { contains: input.q.toLowerCase() } }),
        },
        select: summary,
        orderBy:
          input?.sort === "oldest"
            ? [{ issue_date: "asc" }, { created_at: "asc" }]
            : input?.sort === "highest"
              ? [{ total_cents: "desc" }, { issue_date: "desc" }]
              : input?.sort === "lowest"
                ? [{ total_cents: "asc" }, { issue_date: "desc" }]
                : [{ issue_date: "desc" }, { created_at: "desc" }],
        take: 200,
      }),
    ),

  /** The frozen snapshot the PDF is rendered from. */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const inv = await ctx.prisma.invoice.findFirst({ where: { id: input.id, user_id: ctx.userId } });
    if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
    const snapshot = JSON.parse(inv.snapshot) as InvoiceSnapshot;

    // Invoices issued before clients had a full name / address / logo have none of those keys
    // (a deliberately empty value is stored as null, not absent). Backfill them once from the
    // client's current details and freeze the result, so the old PDF isn't stuck without them.
    const legacy = !("legalName" in snapshot.client) && !("address" in snapshot.client) && !("logo" in snapshot.client);
    if (legacy && inv.client_id) {
      const client = await ctx.prisma.client.findFirst({ where: { id: inv.client_id, user_id: ctx.userId } });
      if (client) {
        snapshot.client = {
          ...snapshot.client,
          legalName: client.legal_name,
          address: client.address,
          logo: client.logo,
        };
        await ctx.prisma.invoice.update({
          where: { id: inv.id },
          data: { snapshot: JSON.stringify(snapshot), search_text: buildSearchText(snapshot) },
        });
      }
    }

    // Invoices issued before "how to pay" existed have no such key (an empty value is stored as
    // null). Backfill once from the account's current instructions and freeze the result.
    if (!("paymentInstructions" in snapshot.seller)) {
      const user = await ctx.prisma.authUser.findUnique({
        where: { id: ctx.userId },
        select: { payment_instructions: true },
      });
      snapshot.seller = { ...snapshot.seller, paymentInstructions: user?.payment_instructions ?? null };
      await ctx.prisma.invoice.update({ where: { id: inv.id }, data: { snapshot: JSON.stringify(snapshot) } });
    }
    return { id: inv.id, snapshot };
  }),

  /** Suggested next number: INV-<year>-<n>, where n continues from the user's invoice count. */
  nextNumber: protectedProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .query(async ({ ctx, input }) => {
      const prefix = `INV-${input.year}-`;
      const count = await ctx.prisma.invoice.count({
        where: { user_id: ctx.userId, number: { startsWith: prefix } },
      });
      return { number: `${prefix}${String(count + 1).padStart(3, "0")}` };
    }),

  /**
   * Compute from the database (never trust client-sent totals), snapshot the seller's current
   * business details, and store. Billable entries for the client's projects in [from, to].
   */
  create: protectedProcedure
    .input(
      z
        .object({
          clientId: z.string(),
          from: dateSchema,
          to: dateSchema,
          number: z.string().trim().min(1, "Enter an invoice number.").max(40),
          issueDate: dateSchema,
          dueDate: dateSchema.nullable().optional(),
          notes: z.string().trim().max(1000).default(""),
          includeDetail: z.boolean().default(true),
        })
        .refine((v) => v.from <= v.to, { message: "The start date must be before the end date." }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.prisma.client.findFirst({ where: { id: input.clientId, user_id: ctx.userId } });
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });

      const dup = await ctx.prisma.invoice.findFirst({ where: { user_id: ctx.userId, number: input.number } });
      if (dup) throw new TRPCError({ code: "CONFLICT", message: `Invoice number ${input.number} is already used.` });

      const entries = await ctx.prisma.timeEntry.findMany({
        where: {
          user_id: ctx.userId,
          date: { gte: input.from, lte: input.to },
          project: { client_id: client.id },
        },
        include: { project: true },
      });
      const totals = buildInvoice(entries);
      if (totals.lines.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No billable time for this client in that period." });
      }

      const user = await ctx.prisma.authUser.findUnique({ where: { id: ctx.userId } });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });

      const snapshot: InvoiceSnapshot = {
        seller: {
          name: user.business_name || user.name || user.email,
          ein: user.ein,
          address: user.address,
          email: user.email,
          logo: user.logo,
          paymentInstructions: user.payment_instructions,
        },
        client: { name: client.name, legalName: client.legal_name, address: client.address, logo: client.logo },
        number: input.number,
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? null,
        periodFrom: input.from,
        periodTo: input.to,
        notes: input.notes,
        includeDetail: input.includeDetail,
        lines: totals.lines,
        detail: totals.detail,
        totalMinutes: totals.totalMinutes,
        totalCents: totals.totalCents,
      };

      const created = await ctx.prisma.invoice.create({
        data: {
          user_id: ctx.userId,
          client_id: client.id,
          client_name: client.name,
          number: input.number,
          issue_date: input.issueDate,
          due_date: input.dueDate ?? null,
          period_from: input.from,
          period_to: input.to,
          total_minutes: totals.totalMinutes,
          total_cents: totals.totalCents,
          notes: input.notes,
          snapshot: JSON.stringify(snapshot),
          search_text: buildSearchText(snapshot),
        },
        select: { id: true },
      });
      return { id: created.id, snapshot };
    }),

  /** Record when an invoice was paid, or pass `paidDate: null` to mark it unpaid again. */
  markPaid: protectedProcedure
    .input(z.object({ id: z.string(), paidDate: dateSchema.nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.prisma.invoice.updateMany({
        where: { id: input.id, user_id: ctx.userId },
        data: { paid_date: input.paidDate },
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
      return { ok: true, paidDate: input.paidDate };
    }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.prisma.invoice.deleteMany({ where: { id: input.id, user_id: ctx.userId } });
    if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
    return { ok: true };
  }),
});
