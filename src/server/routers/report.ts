import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { logError } from "@/lib/log";
import { appUrl } from "@/lib/mailer";
import { CURRENCY_CODES } from "@/lib/money";
import { describeWait, hitRateLimit } from "@/lib/rate-limit";
import { annualReportMessage, REPORT_EMAILS_PER_DAY, reportMailBlocker } from "@/lib/report-mail";

import { yearReport } from "../annual-report";
import { protectedProcedure, router } from "../trpc";

const yearInput = z.object({
  year: z.number().int().min(2000).max(2100),
  // Which currency to summarize. Clients can be billed in different currencies and amounts in different
  // currencies are never added together, so one currency is shown at a time (default: the account's).
  currency: z.enum(CURRENCY_CODES).optional(),
});

export const reportRouter = router({
  /** One calendar year of the caller's time and invoices, summarized for tax time. */
  annual: protectedProcedure.input(yearInput).query(async ({ ctx, input }) => {
    return yearReport(ctx.prisma, ctx.userId, input);
  }),

  /**
   * Emails the caller's own year summary to the caller's own confirmed address, recomputed here (never trusting figures
   * sent by the browser). Only ever the account's own address: it cannot be used to mail anyone else.
   */
  email: protectedProcedure.input(yearInput).mutation(async ({ ctx, input }) => {
    if (!ctx.mailer)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email isn't set up on this server yet." });
    const owner = await ctx.prisma.authUser.findUnique({
      where: { id: ctx.userId },
      select: { email: true, email_verified_at: true, email_bounced_at: true, is_demo: true },
    });
    if (!owner) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
    const blocked = reportMailBlocker(owner);
    if (blocked) throw new TRPCError({ code: "FORBIDDEN", message: blocked });

    const hit = await hitRateLimit(ctx.prisma, `reportmail:u:${ctx.userId}`, REPORT_EMAILS_PER_DAY, 86_400);
    if (!hit.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `You've emailed yourself ${REPORT_EMAILS_PER_DAY} summaries today. Try again in ${describeWait(hit.retryAfterSeconds)}.`,
      });
    }

    const report = await yearReport(ctx.prisma, ctx.userId, input);
    try {
      await ctx.mailer.send(
        annualReportMessage(owner.email, {
          year: input.year,
          currency: report.currency,
          report,
          link: `${ctx.baseUrl ?? appUrl()}/dashboard/report`,
        }),
      );
    } catch (err) {
      logError("report_email_failed", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Couldn't send the email right now. Please try again in a minute.",
      });
    }
    return { to: owner.email };
  }),
});
