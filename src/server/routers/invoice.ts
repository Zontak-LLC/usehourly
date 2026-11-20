import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { MAX_QUERY_DAYS, spanDays } from "@/lib/dates";
import { isDemoSession } from "@/lib/demo";
import { buildSearchText, type InvoiceSnapshot } from "@/lib/invoice";
import { invoiceTotals } from "@/lib/invoice-list";
import { summarizeInvoice } from "@/lib/invoice-summary";
import { logError } from "@/lib/log";
import { assertWithinQuota } from "@/lib/quotas";
import { sha256Hex } from "@/lib/sha256";
import { nextInvoiceNumber } from "@/lib/unbilled";

import { countInvoicesByClient, sumInvoiceMatches } from "../invoice-counts";
import { assertInvoiceCreateAllowed } from "../invoice-create-limit";
import {
  invoiceFilters,
  invoiceListAllInput,
  invoiceOrder,
  invoicePageInput,
  invoiceSummarySelect,
  invoiceWhere,
  lateWhere,
  readAllInvoicesPage,
  readInvoicePage,
  withSummaries,
} from "../invoice-history";
import { logoHashesOf, releaseUnusedInvoiceLogos, storeInvoiceLogo } from "../invoice-logos";
import { openInvoice } from "../invoice-open";
import { assertNumberFree, buildInvoiceSnapshot, invoiceClient, numberUsedError } from "../invoice-snapshot";
import { dateSchema } from "../schemas/dates";
import { protectedProcedure, router } from "../trpc";
import { markInvoiced, unbilledByClient, undoInvoice } from "../unbilled";

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

export { INVOICE_LIST_ALL_PAGE } from "../invoice-history";

/** The most invoices `list` returns. Only global search reads it, and it shows just the newest few matches. */
const LIST_CAP = 200;

export const invoiceRouter = router({
  /** History. `q` matches number, client, notes, project names and entry notes (case-insensitive). */
  list: protectedProcedure.input(invoiceFilters.optional()).query(async ({ ctx, input }) => {
    const rows = await ctx.prisma.invoice.findMany({
      where: invoiceWhere(ctx, input),
      select: invoiceSummarySelect,
      orderBy: invoiceOrder(input?.sort),
      take: LIST_CAP,
    });
    return withSummaries(ctx, rows);
  }),

  /**
   * The history a page of `INVOICE_PAGE` at a time (Invoices' "Load more"), with `list`'s filters and the Waiting and
   * Overdue tabs. Pass the previous page's `nextCursor` until it comes back null.
   */
  listPage: protectedProcedure.input(invoicePageInput).query(({ ctx, input }) => readInvoicePage(ctx, input)),

  /**
   * Every invoice, a page at a time like `entry.listAll` (Totals, Overdue, "Download everything"; `list` stops at the
   * newest 200). `detail: "full"` adds each invoice's frozen snapshot; only the zip asks for it.
   */
  listAll: protectedProcedure.input(invoiceListAllInput).query(({ ctx, input }) => readAllInvoicesPage(ctx, input)),

  /** How many invoices each client has, every invoice counted (Clients' "Invoices · N"). Sends no invoice rows. */
  countByClient: protectedProcedure.query(({ ctx }) => countInvoicesByClient(ctx)),

  /** How many invoices match the filters, and their unpaid cents per currency, over every match (MCP list_invoices). */
  matchTotals: protectedProcedure
    .input(invoiceFilters.omit({ sort: true }).optional())
    .query(({ ctx, input }) => sumInvoiceMatches(ctx, input)),

  /**
   * The money line and the tab counts over EVERY invoice (issue 451: worked out in the browser they stopped at the
   * newest 200). Amounts per currency, never added across currencies; unpaid includes late, as `moneyLines` does.
   * `today` is the browser's date (the Worker runs in UTC).
   */
  totals: protectedProcedure.input(z.object({ today: dateSchema })).query(async ({ ctx, input }) => {
    const sums = (where: object) =>
      ctx.prisma.invoice.groupBy({
        by: ["currency"],
        where: { user_id: ctx.userId, ...where },
        _sum: { total_cents: true },
        _count: { _all: true },
      });
    const [paid, unpaid, late] = await Promise.all([
      sums({ paid_date: { not: null } }),
      sums({ paid_date: null }),
      sums(lateWhere(input.today)),
    ]);
    return invoiceTotals({ paid, unpaid, late });
  }),

  /** Every late, unpaid invoice, newest first (the Overdue tab). No cap: the invoice quota (2,000) bounds it. */
  overdue: protectedProcedure.input(z.object({ today: dateSchema })).query(async ({ ctx, input }) => {
    const rows = await ctx.prisma.invoice.findMany({
      where: invoiceWhere(ctx, { status: "overdue", today: input.today }),
      select: invoiceSummarySelect,
      orderBy: invoiceOrder(),
    });
    return withSummaries(ctx, rows);
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
    await assertInvoiceCreateAllowed(ctx);

    const { snapshot, snapshotText, withLogos, entries, totals, totalCents, currency } = await buildInvoiceSnapshot(
      ctx.prisma,
      ctx.userId,
      client,
      input,
      (logo) => storeInvoiceLogo(ctx.prisma, ctx.userId, logo),
    );

    // Two saves of the same number at once (double click, two tabs) both pass the check above; the unique index
    // [user_id, number] stops the second one here. Only that clash says "already used": other failures stay as they are.
    const created = await ctx.prisma.invoice
      .create({
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
      })
      .catch((e: unknown) => {
        if ((e as { code?: string } | null)?.code === "P2002") throw numberUsedError(input.number);
        throw e;
      });
    // Mark the time it bills, so it is never billed again. If another invoice took some of it in the meantime (two
    // made at once), this one is taken back: it would bill those hours twice.
    const billed = entries.filter((e) => e.project.billable && e.minutes > 0 && !e.started_at).map((e) => e.id);
    // Time billed again on purpose stays marked with the invoice it was first billed on.
    let marked: number;
    try {
      marked = await markInvoiced(ctx.prisma, ctx.userId, created.id, billed);
    } catch (err) {
      // D1 has no real transactions, so this is the rollback: a half-saved invoice would bill its unmarked hours twice.
      // If the undo fails too (D1 fully down), the half-saved invoice is logged by id; the user still sees the first error.
      await undoInvoice(ctx.prisma, ctx.userId, created.id).catch((undoErr: unknown) =>
        logError("invoice_undo_failed", undoErr, { userId: ctx.userId, invoiceId: created.id }),
      );
      throw err;
    }
    if (!input.includeInvoiced && marked < billed.length) {
      await undoInvoice(ctx.prisma, ctx.userId, created.id);
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
