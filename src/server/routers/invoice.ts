import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { MAX_QUERY_DAYS, spanDays } from "@/lib/dates";
import { isDemoSession } from "@/lib/demo";
import { buildSearchText, type InvoiceSnapshot } from "@/lib/invoice";
import { summarizeInvoice } from "@/lib/invoice-summary";
import { logError } from "@/lib/log";
import { assertWithinQuota } from "@/lib/quotas";
import { sha256Hex } from "@/lib/sha256";
import { nextInvoiceNumber } from "@/lib/unbilled";

import { logoHashesOf, releaseUnusedInvoiceLogos, storeInvoiceLogo, withInvoiceLogos } from "../invoice-logos";
import { assertNumberFree, buildInvoiceSnapshot, invoiceClient } from "../invoice-snapshot";
import { dateSchema } from "../schemas/dates";
import { type Context, protectedProcedure, router } from "../trpc";
import { markInvoiced, unbilledByClient } from "../unbilled";

const MAX_SEARCH_CHARS = 50_000;

/** What `preview` and `create` take: one schema, so the preview is always of the invoice Save would make. */
const invoiceInput = z
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
    /** Bill time that is already on another invoice too (off by default: the same hours are never billed twice). */
    includeInvoiced: z.boolean().default(false),
    /** Add the account's tax (Account > Invoices) on top of the lines; ignored when the account has none. */
    addTax: z.boolean().default(false),
  })
  .refine((v) => v.from <= v.to, { message: "The start date must be before the end date." })
  .refine((v) => spanDays(v.from, v.to) <= MAX_QUERY_DAYS, {
    message: `Choose a period of up to a year (${MAX_QUERY_DAYS} days).`,
  });

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
  currency: true,
  notes: true,
  summary: true,
  created_at: true,
} as const;

type StoredInvoice = { id: string; client_id: string | null; snapshot: string; paid_date: string | null };

/** One invoice as the screens read it: its frozen snapshot (old ones backfilled once) with the logos put back. */
async function openInvoice(ctx: Pick<Context, "prisma"> & { userId: string }, inv: StoredInvoice) {
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
        where: { id: inv.id, user_id: ctx.userId },
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
    await ctx.prisma.invoice.update({
      where: { id: inv.id, user_id: ctx.userId },
      data: { snapshot: JSON.stringify(snapshot) },
    });
  }
  return {
    id: inv.id,
    paidDate: inv.paid_date,
    snapshot: await withInvoiceLogos(ctx.prisma, ctx.userId, snapshot),
  };
}

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
          if (text)
            await ctx.prisma.invoice.update({ where: { id: r.id, user_id: ctx.userId }, data: { summary: text } });
          return { ...r, summary: text };
        }),
      );
    }),

  /** The frozen snapshot the PDF is rendered from. */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const inv = await ctx.prisma.invoice.findFirst({ where: { id: input.id, user_id: ctx.userId } });
    if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
    return openInvoice(ctx, inv);
  }),

  /**
   * The newest invoice (the top of `list`, same order), or null with none. Invoices shows it when the address names no
   * invoice: asking for "the newest" instead of an id lets it start in the page's first request (one request per page).
   */
  latest: protectedProcedure.query(async ({ ctx }) => {
    const inv = await ctx.prisma.invoice.findFirst({
      where: { user_id: ctx.userId },
      orderBy: [{ issue_date: "desc" }, { created_at: "desc" }],
    });
    return inv ? openInvoice(ctx, inv) : null;
  }),

  /** Suggested next number: INV-<year>-<n>, one more than the highest n used that year (never a taken one). */
  nextNumber: protectedProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.invoice.findMany({
        where: { user_id: ctx.userId, number: { startsWith: `INV-${input.year}-` } },
        select: { number: true },
      });
      return {
        number: nextInvoiceNumber(
          input.year,
          rows.map((r) => r.number),
        ),
      };
    }),

  /** Per client: billable time not on any invoice yet, what it is worth, and its oldest and newest day. */
  /**
   * Per client: the time not invoiced yet. With the browser's `today` (the Worker runs in UTC), each row also says
   * whether an invoice is due under the client's invoice schedule (issue 100).
   */
  unbilled: protectedProcedure
    .input(z.object({ today: dateSchema }).optional())
    .query(({ ctx, input }) => unbilledByClient(ctx.prisma, ctx.userId, input?.today)),

  /**
   * Compute from the database (never trust client-sent totals), snapshot the seller's current
   * business details, and store. Billable entries for the client's projects in [from, to].
   */
  /**
   * The invoice `create` would make, to check before saving (2026-11-06: testers expected a preview before the
   * download). Same input, same checks and the same snapshot builder as `create`; it writes nothing, marks no time and,
   * being a query, does not count against the per-account write limit.
   */
  preview: protectedProcedure.input(invoiceInput).query(async ({ ctx, input }) => {
    const client = await invoiceClient(ctx.prisma, ctx.userId, input.clientId);
    await assertNumberFree(ctx.prisma, ctx.userId, input.number);
    // Hashing only: storing a logo is a write, and Back to edit would leave it behind.
    const { withLogos } = await buildInvoiceSnapshot(ctx.prisma, ctx.userId, client, input, async (logo) =>
      logo ? sha256Hex(logo) : null,
    );
    return { snapshot: withLogos };
  }),

  create: protectedProcedure.input(invoiceInput).mutation(async ({ ctx, input }) => {
    const client = await invoiceClient(ctx.prisma, ctx.userId, input.clientId);

    assertWithinQuota(
      await ctx.prisma.invoice.count({ where: { user_id: ctx.userId } }),
      1,
      "invoices",
      isDemoSession(ctx.session),
    );
    await assertNumberFree(ctx.prisma, ctx.userId, input.number);

    const { snapshot, snapshotText, withLogos, entries, totals, totalCents, currency } = await buildInvoiceSnapshot(
      ctx.prisma,
      ctx.userId,
      client,
      input,
      (logo) => storeInvoiceLogo(ctx.prisma, ctx.userId, logo),
    );

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
        total_cents: totalCents,
        currency,
        notes: input.notes,
        snapshot: snapshotText,
        search_text: buildSearchText(snapshot).slice(0, MAX_SEARCH_CHARS),
        summary: summarizeInvoice(snapshot),
      },
      select: { id: true },
    });
    // Mark the time it bills, so it is never billed again. If another invoice took some of it in the meantime (two
    // made at once), this one is taken back: it would bill those hours twice.
    const billed = entries.filter((e) => e.project.billable && e.minutes > 0 && !e.started_at).map((e) => e.id);
    // Time billed again on purpose stays marked with the invoice it was first billed on.
    const marked = await markInvoiced(ctx.prisma, ctx.userId, created.id, billed);
    if (!input.includeInvoiced && marked < billed.length) {
      await ctx.prisma.timeEntry.updateMany({
        where: { user_id: ctx.userId, invoice_id: created.id },
        data: { invoice_id: null },
      });
      await ctx.prisma.invoice.deleteMany({ where: { id: created.id, user_id: ctx.userId } });
      throw new TRPCError({
        code: "CONFLICT",
        message: "Some of this time was just put on another invoice. Check the period and try again.",
      });
    }
    // The caller gets the logos back inline so it can draw the PDF at once.
    return { id: created.id, snapshot: withLogos };
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
        logError("invoice_logo_cleanup_failed", e); // the invoice is gone; a leftover logo is harmless
      }
    }
    return { ok: true };
  }),
});
