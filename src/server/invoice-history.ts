import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { InvoiceSnapshot } from "@/lib/invoice";
import { summarizeInvoice } from "@/lib/invoice-summary";

import { type CursorPage, cursorArgs, cursorInput, toPage } from "./cursor-page";
import { dateSchema } from "./schemas/dates";

/** Invoices per page of `invoice.listPage` (Invoices' "Load more"), the same as `list`'s cap. */
export const INVOICE_PAGE = 200;

type Reader = { prisma: PrismaClient; userId: string };

/** What a list row needs: never the snapshot or the search text, which can be large. */
export const invoiceSummarySelect = {
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

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

/** The history's filters, as `invoice.list` takes them. `q` matches the stored search text, case-insensitive. */
export const invoiceFilters = z.object({
  q: z.string().trim().max(100).optional(),
  clientId: z.string().optional(),
  status: z.enum(["all", "unpaid", "paid"]).optional(),
  // Issue date range (inclusive, YYYY-MM-DD).
  from: isoDate,
  to: isoDate,
  sort: z.enum(["newest", "oldest", "highest", "lowest"]).optional(),
});

/**
 * One page of the history (`invoice.listPage`): the same filters, plus Invoices' Waiting and Overdue tabs, which need
 * the browser's `today` (the Worker runs in UTC), and the previous page's cursor.
 */
export const invoicePageInput = invoiceFilters
  .extend({
    status: z.enum(["all", "unpaid", "paid", "waiting", "overdue"]).optional(),
    today: dateSchema.optional(),
    cursor: cursorInput,
  })
  .refine((v) => Boolean(v.today) || (v.status !== "waiting" && v.status !== "overdue"), {
    message: "Pass today for waiting or overdue.",
    path: ["today"],
  });

type Filters = Omit<z.infer<typeof invoicePageInput>, "cursor">;
type Sort = NonNullable<Filters["sort"]>;

/**
 * Late = unpaid with a due date before `today`: the same rule as `daysLate` in lib/invoice-mail.ts. Shared by the
 * totals, the Overdue list and the Overdue tab's pages.
 */
export const lateWhere = (today: string) => ({ paid_date: null, due_date: { not: null, lt: today } });

function statusWhere(status: Filters["status"], today: string | undefined): Prisma.InvoiceWhereInput {
  if (status === "paid") return { paid_date: { not: null } };
  if (status === "unpaid") return { paid_date: null };
  if (status !== "waiting" && status !== "overdue") return {};
  if (!today) throw new Error("Pass today for waiting or overdue.");
  if (status === "overdue") return lateWhere(today);
  // Waiting = unpaid and not late: no due date, or due today or later.
  return { paid_date: null, OR: [{ due_date: null }, { due_date: { gte: today } }] };
}

/**
 * The `where` for the caller's invoices that match `filters`: always scoped to the account. Throws when a Waiting or
 * Overdue status comes without `today` (the input schema refuses that first).
 */
export function invoiceWhere(ctx: { userId: string }, filters: Filters = {}): Prisma.InvoiceWhereInput {
  const { from, to, clientId, q } = filters;
  return {
    user_id: ctx.userId,
    ...((from || to) && { issue_date: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
    ...(clientId && { client_id: clientId }),
    ...statusWhere(filters.status, filters.today),
    ...(q && { search_text: { contains: q.toLowerCase() } }),
  };
}

const ORDERS: Record<Sort, Prisma.InvoiceOrderByWithRelationInput[]> = {
  newest: [{ issue_date: "desc" }, { created_at: "desc" }],
  oldest: [{ issue_date: "asc" }, { created_at: "asc" }],
  highest: [{ total_cents: "desc" }, { issue_date: "desc" }],
  lowest: [{ total_cents: "asc" }, { issue_date: "desc" }],
};

/**
 * The history's `orderBy` for a sort (newest first by default). Every order ends with `{ id: "asc" }`, so invoices
 * that tie on every other key keep one order and a cursor page never repeats or skips one.
 */
export function invoiceOrder(sort: Sort = "newest"): Prisma.InvoiceOrderByWithRelationInput[] {
  return [...ORDERS[sort], { id: "asc" }];
}

type SummaryRow = { id: string; summary: string | null };

/**
 * Invoices made before summaries existed have an empty one: works it out once from the frozen snapshot and keeps it (a
 * few rows at most, the first time the history is opened). Returns the rows with their summaries. Shared by every
 * history read (`list`, `listPage`, `listAll`, `overdue`).
 */
export function withSummaries<T extends SummaryRow>(ctx: Reader, rows: T[]) {
  return Promise.all(
    rows.map(async (r) => {
      if (r.summary) return r;
      const row = await ctx.prisma.invoice.findFirst({
        where: { id: r.id, user_id: ctx.userId },
        select: { snapshot: true },
      });
      if (!row) return r;
      const text = summarizeInvoice(JSON.parse(row.snapshot) as InvoiceSnapshot);
      if (text) await ctx.prisma.invoice.update({ where: { id: r.id, user_id: ctx.userId }, data: { summary: text } });
      return { ...r, summary: text };
    }),
  );
}

type InvoiceSummaryRow = Prisma.InvoiceGetPayload<{ select: typeof invoiceSummarySelect }>;
type InvoicePage = CursorPage<InvoiceSummaryRow>;

/** Invoices per page of `invoice.listAll` (at most 4 pages at the 2,000 quota). */
export const INVOICE_LIST_ALL_PAGE = 500;

/**
 * What `invoice.listAll` takes: the previous page's cursor, and how much of each invoice to send. `"summary"` (the
 * default, for Totals, the Overdue tab and Invoices) is the list row; `"full"` adds the frozen snapshot, for the zip.
 */
export const invoiceListAllInput = z.object({
  cursor: cursorInput,
  detail: z.enum(["summary", "full"]).default("summary"),
});

/** A `listAll` row: the list row, plus the parsed snapshot when `"full"` was asked for. */
export type InvoiceListAllRow = InvoiceSummaryRow & { snapshot?: InvoiceSnapshot };

/**
 * One page of `INVOICE_LIST_ALL_PAGE` of the caller's invoices, newest first, from `cursor` on (every invoice, no
 * filters). With `detail: "full"` each row also carries its snapshot, parsed. Returns the page and the next cursor.
 */
export async function readAllInvoicesPage(
  ctx: Reader,
  input: z.infer<typeof invoiceListAllInput>,
): Promise<CursorPage<InvoiceListAllRow>> {
  const isFull = input.detail === "full";
  const rows = await ctx.prisma.invoice.findMany({
    where: { user_id: ctx.userId },
    select: { ...invoiceSummarySelect, snapshot: isFull },
    orderBy: invoiceOrder(),
    ...cursorArgs(input.cursor, INVOICE_LIST_ALL_PAGE),
  });
  const page = toPage(rows, INVOICE_LIST_ALL_PAGE);
  const items = await withSummaries(ctx, page.items);
  return {
    ...page,
    items: items.map(({ snapshot, ...row }) =>
      isFull && snapshot ? { ...row, snapshot: JSON.parse(snapshot) as InvoiceSnapshot } : row,
    ),
  };
}

/**
 * One page of `INVOICE_PAGE` invoices that match the filters, in the chosen order, from `cursor` on. Returns the page
 * and the cursor of the next one (null on the last page).
 */
export async function readInvoicePage(ctx: Reader, input: z.infer<typeof invoicePageInput>): Promise<InvoicePage> {
  const { cursor, ...filters } = input;
  const rows = await ctx.prisma.invoice.findMany({
    where: invoiceWhere(ctx, filters),
    select: invoiceSummarySelect,
    orderBy: invoiceOrder(filters.sort),
    ...cursorArgs(cursor, INVOICE_PAGE),
  });
  const page = toPage(rows, INVOICE_PAGE);
  return { ...page, items: await withSummaries(ctx, page.items) };
}
