import type { Prisma, PrismaClient } from "@prisma/client";
import type { z } from "zod";

import { type invoiceFilters, invoiceWhere } from "./invoice-history";

type Reader = { prisma: PrismaClient; userId: string };

/** The history's filters without an order: a count or a sum does not depend on it. */
export type InvoiceMatchFilters = Omit<z.infer<typeof invoiceFilters>, "sort">;

/** How many invoices each client has, every invoice counted. */
export type ClientInvoiceCount = { clientId: string; count: number };

/** Every match of the filters, and the unpaid money among them, one figure per currency (never added across). */
export type InvoiceMatchTotals = { count: number; unpaid: { currency: string; cents: number }[] };

/**
 * The caller's invoice count per client, over every invoice (Clients' "Invoices · N"). Invoices with no client are
 * left out. Returns one row per client that has invoices, never an invoice row.
 */
export async function countInvoicesByClient(ctx: Reader): Promise<ClientInvoiceCount[]> {
  const groups = await ctx.prisma.invoice.groupBy({
    by: ["client_id"],
    where: { user_id: ctx.userId, client_id: { not: null } },
    _count: { _all: true },
  });
  return groups.flatMap((g) => (g.client_id ? [{ clientId: g.client_id, count: g._count._all }] : []));
}

/**
 * How many of the caller's invoices match `filters`, and their unpaid cents per currency, over EVERY match (the MCP
 * `list_invoices` totals; its rows stop at one page).
 */
export async function sumInvoiceMatches(ctx: Reader, filters: InvoiceMatchFilters = {}): Promise<InvoiceMatchTotals> {
  const sums = (where: Prisma.InvoiceWhereInput) =>
    ctx.prisma.invoice.groupBy({
      by: ["currency"],
      where,
      _sum: { total_cents: true },
      _count: { _all: true },
    });
  // Paid-only matches hold no unpaid money; any other status narrows to its unpaid ones.
  const [all, unpaid] = await Promise.all([
    sums(invoiceWhere(ctx, filters)),
    filters.status === "paid" ? [] : sums(invoiceWhere(ctx, { ...filters, status: "unpaid" })),
  ]);
  return {
    count: all.reduce((n, g) => n + g._count._all, 0),
    unpaid: unpaid.map((g) => ({ currency: g.currency, cents: g._sum.total_cents ?? 0 })),
  };
}
