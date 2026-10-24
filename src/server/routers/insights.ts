import { TRPCError } from "@trpc/server";

import { buildInsights } from "@/lib/insights";
import { supportNoticeInput } from "@/lib/support-notice";
import { usageDay } from "@/lib/usage";

import { isAdminAccount } from "../admin-access";
import { accountActivity } from "../insights-activity";
import { readSupportNoticeSetting, writeSupportNotice } from "../support-notice";
import { protectedProcedure, router } from "../trpc";

const DAY = 86_400_000;
const MAX_ACCOUNTS = 20_000;

export const insightsRouter = router({
  /** The "chip in" notice as the owner left it (owner only, like the rest of Insights). */
  supportNotice: protectedProcedure.query(async ({ ctx }) => {
    if (!(await isAdminAccount(ctx.prisma, ctx.userId))) throw new TRPCError({ code: "NOT_FOUND" });
    return readSupportNoticeSetting(ctx.prisma);
  }),

  /** Switches the notice on or off and sets the monthly amount it names. Owner only. */
  setSupportNotice: protectedProcedure.input(supportNoticeInput).mutation(async ({ ctx, input }) => {
    if (!(await isAdminAccount(ctx.prisma, ctx.userId))) throw new TRPCError({ code: "NOT_FOUND" });
    await writeSupportNotice(ctx.prisma, input);
    return readSupportNoticeSetting(ctx.prisma);
  }),

  /**
   * Aggregate numbers about how the app is used, for the owner only. To everyone else the route does not
   * exist (NOT_FOUND, not FORBIDDEN), so it cannot be used to find out who the admins are.
   */
  overview: protectedProcedure.query(async ({ ctx }) => {
    if (!(await isAdminAccount(ctx.prisma, ctx.userId))) throw new TRPCError({ code: "NOT_FOUND" });
    const now = new Date();
    const sinceDay = usageDay(new Date(now.getTime() - 30 * DAY));
    const [users, demoCount, activity, invoiceUsers, usage] = await Promise.all([
      ctx.prisma.authUser.findMany({
        where: { is_demo: false },
        select: { id: true, created_at: true },
        orderBy: { id: "asc" },
        take: MAX_ACCOUNTS,
      }),
      ctx.prisma.authUser.count({ where: { is_demo: true } }),
      // Per account, one short seek each (server/insights-activity.ts), never a scan of every entry.
      accountActivity(ctx.prisma, now, MAX_ACCOUNTS),
      ctx.prisma.invoice.groupBy({ by: ["user_id"] }),
      ctx.prisma.usageDaily.findMany({ where: { day: { gte: sinceDay } } }),
    ]);
    return buildInsights({
      now,
      users,
      demoCount,
      ...activity,
      invoiceUserIds: invoiceUsers.map((r) => r.user_id),
      usage,
    });
  }),
});
