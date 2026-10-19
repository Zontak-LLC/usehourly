import { z } from "zod";

import { buildAnnualReport } from "@/lib/annual-report";

import { nonBillableDates } from "../non-billable";
import { protectedProcedure, router } from "../trpc";

export const reportRouter = router({
  /** One calendar year of the caller's time and invoices, summarized for tax time. */
  annual: protectedProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .query(async ({ ctx, input }) => {
      const from = `${input.year}-01-01`;
      const to = `${input.year}-12-31`;
      const [allEntries, skipDays, projects, invoices] = await Promise.all([
        ctx.prisma.timeEntry.findMany({
          where: { user_id: ctx.userId, date: { gte: from, lte: to } },
          select: { date: true, minutes: true, project_id: true },
        }),
        nonBillableDates(ctx.prisma, ctx.userId, { from, to }),
        // Archived projects included: their past time still belongs in the year.
        ctx.prisma.project.findMany({
          where: { user_id: ctx.userId },
          omit: { logo: true },
          include: { client: { select: { id: true, name: true } } },
        }),
        ctx.prisma.invoice.findMany({
          // Issued in the year (accrual) or paid in it (cash), whichever year it was issued.
          where: {
            user_id: ctx.userId,
            OR: [{ issue_date: { gte: from, lte: to } }, { paid_date: { gte: from, lte: to } }],
          },
          select: {
            number: true,
            client_name: true,
            issue_date: true,
            paid_date: true,
            total_cents: true,
            total_minutes: true,
          },
        }),
      ]);

      // Days marked non-billable are left out of the year summary entirely.
      const entries = allEntries.filter((e) => !skipDays.has(e.date));

      return buildAnnualReport({
        year: input.year,
        entries,
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          hourly_rate: p.hourly_rate,
          billable: p.billable,
          client_id: p.client.id,
          client_name: p.client.name,
        })),
        invoices,
      });
    }),
});
