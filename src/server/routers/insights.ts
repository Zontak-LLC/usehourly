import { TRPCError } from "@trpc/server";

import { buildInsights } from "@/lib/insights";
import { supportNoticeInput } from "@/lib/support-notice";
import { usageDay } from "@/lib/usage";

import { isAdminAccount } from "../admin-access";
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
    const since = (days: number) => new Date(now.getTime() - days * DAY);
    const sinceDay = usageDay(since(30));
    const [users, demoCount, entryStats, active7, active30, entries30, invoiceUsers, usage] = await Promise.all([
      ctx.prisma.authUser.findMany({
        where: { is_demo: false },
        select: { id: true, created_at: true },
        take: MAX_ACCOUNTS,
      }),
      ctx.prisma.authUser.count({ where: { is_demo: true } }),
      ctx.prisma.timeEntry.groupBy({ by: ["user_id"], _count: { _all: true }, _min: { created_at: true } }),
      ctx.prisma.timeEntry.groupBy({ by: ["user_id"], where: { updated_at: { gte: since(7) } } }),
      ctx.prisma.timeEntry.groupBy({ by: ["user_id"], where: { updated_at: { gte: since(30) } } }),
      ctx.prisma.timeEntry.groupBy({
        by: ["user_id"],
        where: { created_at: { gte: since(30) } },
        _count: { _all: true },
      }),
      ctx.prisma.invoice.groupBy({ by: ["user_id"] }),
      ctx.prisma.usageDaily.findMany({ where: { day: { gte: sinceDay } } }),
    ]);
    return buildInsights({
      now,
      users,
      demoCount,
      entryStats: entryStats.map((s) => ({ user_id: s.user_id, count: s._count._all, first: s._min.created_at })),
      active7: active7.map((r) => r.user_id),
      active30: active30.map((r) => r.user_id),
      entries30: entries30.map((r) => ({ user_id: r.user_id, count: r._count._all })),
      invoiceUserIds: invoiceUsers.map((r) => r.user_id),
      usage,
    });
  }),
});
