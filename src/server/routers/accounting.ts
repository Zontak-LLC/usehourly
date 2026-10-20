import { z } from "zod";

import type { AccountingInvoice } from "@/lib/accounting-export";
import { DATE_RE, isRealDate } from "@/lib/dates";
import type { InvoiceSnapshot } from "@/lib/invoice";
import { CURRENCY_CODES, currencyOrDefault } from "@/lib/money";

import { protectedProcedure, router } from "../trpc";

const dateSchema = z.string().regex(DATE_RE, "Use YYYY-MM-DD").refine(isRealDate, "That is not a real date.");
/** Invoices per request. Each one carries its frozen copy, so a request is bounded; the screen asks for a shorter range. */
const MAX_INVOICES = 200;

export const accountingRouter = router({
  /** The currencies this account has invoices in (usually one), so the export can ask which to write. */
  currencies: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.invoice.groupBy({ by: ["currency"], where: { user_id: ctx.userId } });
    return rows.map((r) => currencyOrDefault(r.currency)).sort();
  }),

  /**
   * The caller's invoices issued in [from, to], oldest first, with their lines, for the files an accounting app
   * imports (built in the browser, see lib/accounting-export.ts). `more` is true when the range held more than fit.
   */
  invoices: protectedProcedure
    .input(
      z
        .object({
          from: dateSchema,
          to: dateSchema,
          // The files carry plain numbers, so one currency per file: two currencies are never mixed in one.
          currency: z.enum(CURRENCY_CODES).optional(),
        })
        .refine((v) => v.from <= v.to, { message: "The start date must be before the end date." }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.invoice.findMany({
        where: {
          user_id: ctx.userId,
          issue_date: { gte: input.from, lte: input.to },
          ...(input.currency ? { currency: input.currency } : {}),
        },
        select: {
          number: true,
          issue_date: true,
          due_date: true,
          paid_date: true,
          total_cents: true,
          client_id: true,
          snapshot: true,
        },
        orderBy: [{ issue_date: "asc" }, { created_at: "asc" }],
        take: MAX_INVOICES + 1,
      });
      const more = rows.length > MAX_INVOICES;
      const page = more ? rows.slice(0, MAX_INVOICES) : rows;

      // The client's email lives on the client, not in the frozen invoice; one lookup, scoped to the account.
      const clientIds = [...new Set(page.flatMap((r) => (r.client_id ? [r.client_id] : [])))];
      const emails = new Map<string, string | null>();
      if (clientIds.length > 0) {
        const clients = await ctx.prisma.client.findMany({
          where: { user_id: ctx.userId, id: { in: clientIds } },
          select: { id: true, email: true },
        });
        for (const c of clients) emails.set(c.id, c.email);
      }

      const invoices: AccountingInvoice[] = page.map((r) => {
        const snap = JSON.parse(r.snapshot) as InvoiceSnapshot;
        return {
          number: r.number,
          issueDate: r.issue_date,
          dueDate: r.due_date,
          paidDate: r.paid_date,
          periodFrom: snap.periodFrom,
          periodTo: snap.periodTo,
          totalCents: r.total_cents,
          notes: snap.notes ?? "",
          client: {
            name: snap.client.name,
            legalName: snap.client.legalName ?? null,
            address: snap.client.address ?? null,
            email: r.client_id ? (emails.get(r.client_id) ?? null) : null,
          },
          lines: snap.lines.map((l) => ({
            project: l.project,
            minutes: l.minutes,
            rateCents: l.rateCents,
            amountCents: l.amountCents,
          })),
        };
      });
      return { invoices, more };
    }),
});
