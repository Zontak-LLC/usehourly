import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { DATE_RE, isRealDate, MAX_QUERY_DAYS, spanDays } from "@/lib/dates";
import { isDemoSession } from "@/lib/demo";
import { buildInvoice, buildSearchText, type InvoiceSnapshot } from "@/lib/invoice";
import { summarizeInvoice } from "@/lib/invoice-summary";
import { assertWithinQuota } from "@/lib/quotas";
import { isRounding, type Rounding } from "@/lib/rounding";

import { logoHashesOf, releaseUnusedInvoiceLogos, storeInvoiceLogo, withInvoiceLogos } from "../invoice-logos";
import { protectedProcedure, router } from "../trpc";

const MAX_SNAPSHOT_CHARS = 900_000; // D1 rows top out at 2 MB; keep well under
const MAX_SEARCH_CHARS = 50_000;

const dateSchema = z.string().regex(DATE_RE, "Use YYYY-MM-DD").refine(isRealDate, "That is not a real date.");

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
  summary: true,
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
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.invoice.findMany({
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
      });
      // Invoices made before summaries existed have an empty one: work it out once from the frozen
      // snapshot and keep it (a few rows at most, the first time the history is opened).
      return Promise.all(
        rows.map(async (r) => {
          if (r.summary) return r;
          const row = await ctx.prisma.invoice.findFirst({
            where: { id: r.id, user_id: ctx.userId },
            select: { snapshot: true },
          });
          if (!row) return r;
          const text = summarizeInvoice(JSON.parse(row.snapshot) as InvoiceSnapshot);
          if (text) await ctx.prisma.invoice.update({ where: { id: r.id }, data: { summary: text } });
          return { ...r, summary: text };
        }),
      );
    }),

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
    return { id: inv.id, snapshot: await withInvoiceLogos(ctx.prisma, ctx.userId, snapshot) };
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
          compactNotes: z.boolean().default(false),
        })
        .refine((v) => v.from <= v.to, { message: "The start date must be before the end date." })
        .refine((v) => spanDays(v.from, v.to) <= MAX_QUERY_DAYS, {
          message: `Choose a period of up to a year (${MAX_QUERY_DAYS} days).`,
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.prisma.client.findFirst({ where: { id: input.clientId, user_id: ctx.userId } });
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });

      assertWithinQuota(
        await ctx.prisma.invoice.count({ where: { user_id: ctx.userId } }),
        1,
        "invoices",
        isDemoSession(ctx.session),
      );
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
      const rounding: Rounding = {
        step: client.round_step ?? 0,
        mode: client.round_mode === "nearest" ? "nearest" : "up",
        min: client.round_min ?? 0,
      };
      const totals = buildInvoice(entries, rounding);
      if (totals.lines.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No billable time for this client in that period." });
      }
      if (totals.totalCents === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Every project in that period has an hourly rate of $0, so the invoice would be $0.00. Set the rates under Projects & Clients first.",
        });
      }

      const user = await ctx.prisma.authUser.findUnique({ where: { id: ctx.userId } });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });

      const sellerLogoHash = await storeInvoiceLogo(ctx.prisma, ctx.userId, user.logo);
      const clientLogoHash = await storeInvoiceLogo(ctx.prisma, ctx.userId, client.logo);
      const snapshot: InvoiceSnapshot = {
        seller: {
          name: user.business_name || user.name || user.email,
          ein: user.ein,
          address: user.address,
          // A demo account has no real address, so the sample invoice shows an obvious placeholder.
          email: user.is_demo ? "you@yourbusiness.example" : user.email,
          logo: null, // stored once in invoice_logos and referenced by hash (see below)
          logoHash: sellerLogoHash,
          paymentInstructions: user.payment_instructions,
        },
        client: {
          name: client.name,
          legalName: client.legal_name,
          address: client.address,
          logo: null,
          logoHash: clientLogoHash,
        },
        number: input.number,
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? null,
        periodFrom: input.from,
        periodTo: input.to,
        notes: input.notes,
        includeDetail: input.includeDetail,
        compactNotes: input.compactNotes,
        branding: user.invoice_branding,
        lines: totals.lines,
        detail: totals.detail,
        totalMinutes: totals.totalMinutes,
        totalCents: totals.totalCents,
        ...(isRounding(rounding) ? { rounding, loggedMinutes: totals.loggedMinutes } : {}),
      };

      const snapshotText = JSON.stringify(snapshot);
      if (snapshotText.length > MAX_SNAPSHOT_CHARS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That invoice has too much detail to store. Choose a shorter period, or turn off the time breakdown.",
        });
      }

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
          snapshot: snapshotText,
          search_text: buildSearchText(snapshot).slice(0, MAX_SEARCH_CHARS),
          summary: summarizeInvoice(snapshot),
        },
        select: { id: true },
      });
      // The caller gets the logos back inline so it can draw the PDF at once.
      return {
        id: created.id,
        snapshot: {
          ...snapshot,
          seller: { ...snapshot.seller, logo: user.logo },
          client: { ...snapshot.client, logo: client.logo },
        } as InvoiceSnapshot,
      };
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
    const row = await ctx.prisma.invoice.findFirst({
      where: { id: input.id, user_id: ctx.userId },
      select: { snapshot: true },
    });
    const { count } = await ctx.prisma.invoice.deleteMany({ where: { id: input.id, user_id: ctx.userId } });
    if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
    if (row) {
      try {
        await releaseUnusedInvoiceLogos(
          ctx.prisma,
          ctx.userId,
          logoHashesOf(JSON.parse(row.snapshot) as InvoiceSnapshot),
        );
      } catch (e) {
        console.error("invoice logo cleanup failed:", e); // the invoice is gone; a leftover logo is harmless
      }
    }
    return { ok: true };
  }),
});
