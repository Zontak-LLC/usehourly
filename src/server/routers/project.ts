import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { type BudgetPeriod, type BudgetUnit, budgetStatus, usedAmount } from "@/lib/budget";
import { DATE_RE, isRealDate } from "@/lib/dates";
import { isDemoSession } from "@/lib/demo";

import { projectLogoSchema } from "../logo-schema";
import { nonBillableDates } from "../non-billable";
import { accountQuota, insertWithinQuota, QuotaInsertDuplicate } from "../quota-insert";
import { protectedProcedure, router } from "../trpc";

/**
 * The entries of some projects that fall on any of the given days. D1 allows only 100 bound values in one query, so
 * the days go in groups (the account, the projects and the days all count as values).
 */
async function entriesOnDays(
  prisma: PrismaClient,
  userId: string,
  projectIds: string[],
  days: string[],
): Promise<{ project_id: string; minutes: number }[]> {
  const perQuery = Math.max(1, 90 - projectIds.length);
  const groups: string[][] = [];
  for (let i = 0; i < days.length; i += perQuery) groups.push(days.slice(i, i + perQuery));
  const rows = await Promise.all(
    groups.map((group) =>
      prisma.timeEntry.findMany({
        where: { user_id: userId, project_id: { in: projectIds }, date: { in: group } },
        select: { project_id: true, minutes: true },
      }),
    ),
  );
  return rows.flat();
}

export const projectRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        clientId: z.string(),
        name: z.string().trim().min(1).max(80),
        hourlyRate: z.number().int().min(0).max(10_000_00).default(0),
        billable: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.prisma.client.findFirst({ where: { id: input.clientId, user_id: ctx.userId } });
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
      const taken = () =>
        new TRPCError({ code: "CONFLICT", message: `"${client.name}" already has a project "${input.name}".` });
      const dup = await ctx.prisma.project.findFirst({ where: { client_id: client.id, name: input.name } });
      if (dup) throw taken();
      try {
        // The limit check and the insert are one statement, so two creates at once cannot both pass the count.
        const id = await insertWithinQuota(
          ctx.prisma,
          "projects",
          {
            user_id: ctx.userId,
            client_id: client.id,
            name: input.name,
            hourly_rate: input.hourlyRate,
            billable: input.billable,
          },
          accountQuota("projects", "projects", ctx.userId, isDemoSession(ctx.session)),
        );
        return await ctx.prisma.project.findUniqueOrThrow({ where: { id } });
      } catch (err) {
        if (err instanceof QuotaInsertDuplicate) throw taken(); // the same name, sent twice at once
        throw err;
      }
    }),

  archive: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.prisma.project.updateMany({
      where: { id: input.id, user_id: ctx.userId },
      data: { archived: true },
    });
    if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
    return { ok: true };
  }),

  update: protectedProcedure
    .input(
      z
        .object({
          id: z.string(),
          name: z.string().trim().min(1).max(80).optional(),
          clientId: z.string().optional(),
          hourlyRate: z.number().int().min(0).max(10_000_00).optional(),
          billable: z.boolean().optional(),
          // undefined = leave as is; null = remove the logo.
          logo: projectLogoSchema.optional(),
          // The budget: minutes (hours) or cents (dollars). undefined = leave as is; null = remove the budget.
          budgetAmount: z.number().int().min(1).max(100_000_000).nullable().optional(),
          budgetUnit: z.enum(["hours", "dollars"]).optional(),
          budgetPeriod: z.enum(["month", "total"]).optional(),
        })
        .refine((v) => v.budgetAmount == null || v.budgetUnit !== undefined, {
          message: "Say whether the budget is in hours or dollars.",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({ where: { id: input.id, user_id: ctx.userId } });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });

      let clientId = project.client_id;
      if (input.clientId && input.clientId !== project.client_id) {
        const target = await ctx.prisma.client.findFirst({ where: { id: input.clientId, user_id: ctx.userId } });
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
        clientId = target.id;
      }
      const name = input.name ?? project.name;
      if (clientId !== project.client_id || name !== project.name) {
        const dup = await ctx.prisma.project.findFirst({
          where: { client_id: clientId, name, NOT: { id: project.id } },
        });
        if (dup) throw new TRPCError({ code: "CONFLICT", message: `That client already has a project "${name}".` });
      }
      return ctx.prisma.project.update({
        where: { id: project.id, user_id: ctx.userId },
        data: {
          name,
          client_id: clientId,
          ...(input.hourlyRate !== undefined && { hourly_rate: input.hourlyRate }),
          ...(input.billable !== undefined && { billable: input.billable }),
          ...(input.logo !== undefined && { logo: input.logo }),
          ...(input.budgetAmount !== undefined && {
            budget_amount: input.budgetAmount,
            budget_unit: input.budgetAmount === null ? null : (input.budgetUnit ?? null),
            ...(input.budgetPeriod !== undefined && { budget_period: input.budgetPeriod }),
          }),
        },
        omit: { logo: true },
      });
    }),

  /** {projectId: dataUrl} for projects that have a logo — one small query shared by every view. */
  logos: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.project.findMany({
      where: { user_id: ctx.userId, logo: { not: null } },
      select: { id: true, logo: true },
    });
    return Object.fromEntries(rows.flatMap((r) => (r.logo ? [[r.id, r.logo] as const] : [])));
  }),

  unarchive: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const project = await ctx.prisma.project.findFirst({ where: { id: input.id, user_id: ctx.userId } });
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
    await ctx.prisma.project.update({ where: { id: project.id, user_id: ctx.userId }, data: { archived: false } });
    // A restored project under an archived client would stay invisible — restore the client too.
    await ctx.prisma.client.updateMany({
      where: { id: project.client_id, user_id: ctx.userId },
      data: { archived: false },
    });
    return { ok: true };
  }),

  listArchived: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.project.findMany({
      where: { user_id: ctx.userId, archived: true },
      omit: { logo: true },
      include: { client: { omit: { logo: true } } },
      orderBy: { name: "asc" },
    }),
  ),

  /** Logged minutes per project: all-time and within [from, to] (e.g. this month). */
  totals: protectedProcedure
    .input(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const [all, range] = await Promise.all([
        // The newest day too (the Clients list says how long a quiet client has been quiet); the covering index has it.
        ctx.prisma.timeEntry.groupBy({
          by: ["project_id"],
          where: { user_id: ctx.userId },
          _sum: { minutes: true },
          _max: { date: true },
        }),
        ctx.prisma.timeEntry.groupBy({
          by: ["project_id"],
          where: { user_id: ctx.userId, date: { gte: input.from, lte: input.to } },
          _sum: { minutes: true },
        }),
      ]);
      const out: Record<string, { total: number; range: number; last: string | null }> = {};
      for (const r of all) out[r.project_id] = { total: r._sum.minutes ?? 0, range: 0, last: r._max?.date ?? null };
      for (const r of range) {
        const entry = out[r.project_id] ?? { total: 0, range: 0, last: null };
        entry.range = r._sum.minutes ?? 0;
        out[r.project_id] = entry;
      }
      return out;
    }),

  /**
   * How much of each project's budget is used, for the projects that have one. A "month" budget counts the entries
   * in [from, to] (the calendar month the screen is showing); a "total" budget counts everything. Days marked
   * non-billable are left out. A dollars budget prices the time at the project's rate, so a non-billable project
   * uses none of it; an hours budget counts the hours either way.
   */
  budgets: protectedProcedure
    .input(
      z.object({
        from: z.string().regex(DATE_RE).refine(isRealDate),
        to: z.string().regex(DATE_RE).refine(isRealDate),
      }),
    )
    .query(async ({ ctx, input }) => {
      const projects = await ctx.prisma.project.findMany({
        where: { user_id: ctx.userId, budget_amount: { not: null } },
        select: {
          id: true,
          hourly_rate: true,
          billable: true,
          budget_amount: true,
          budget_unit: true,
          budget_period: true,
        },
      });
      if (projects.length === 0) return {};
      // Read as little as possible (this runs on most screens): a month budget needs only that month's entries; a
      // whole-project budget needs one SUM per project plus the few entries that fall on non-billable days, to take
      // them back out. Neither loads the account's whole history.
      const monthIds = projects.filter((p) => p.budget_period !== "total").map((p) => p.id);
      const totalIds = projects.filter((p) => p.budget_period === "total").map((p) => p.id);
      const skipDays = await nonBillableDates(ctx.prisma, ctx.userId);
      const [monthEntries, totalSums, skippedEntries] = await Promise.all([
        monthIds.length
          ? ctx.prisma.timeEntry.findMany({
              where: { user_id: ctx.userId, project_id: { in: monthIds }, date: { gte: input.from, lte: input.to } },
              select: { project_id: true, date: true, minutes: true },
            })
          : [],
        totalIds.length
          ? ctx.prisma.timeEntry.groupBy({
              by: ["project_id"],
              where: { user_id: ctx.userId, project_id: { in: totalIds } },
              _sum: { minutes: true },
            })
          : [],
        totalIds.length && skipDays.size > 0 ? entriesOnDays(ctx.prisma, ctx.userId, totalIds, [...skipDays]) : [],
      ]);
      const minutesByProject = new Map<string, number>();
      for (const e of monthEntries) {
        if (skipDays.has(e.date)) continue;
        minutesByProject.set(e.project_id, (minutesByProject.get(e.project_id) ?? 0) + e.minutes);
      }
      for (const r of totalSums) minutesByProject.set(r.project_id, r._sum.minutes ?? 0);
      for (const e of skippedEntries) {
        minutesByProject.set(e.project_id, (minutesByProject.get(e.project_id) ?? 0) - e.minutes);
      }
      const out: Record<string, ReturnType<typeof budgetStatus>> = {};
      for (const p of projects) {
        if (p.budget_amount === null || (p.budget_unit !== "hours" && p.budget_unit !== "dollars")) continue;
        const unit: BudgetUnit = p.budget_unit;
        const period: BudgetPeriod = p.budget_period === "total" ? "total" : "month";
        const minutes = Math.max(0, minutesByProject.get(p.id) ?? 0);
        out[p.id] = budgetStatus({
          amount: p.budget_amount,
          unit,
          period,
          // a non-billable project costs nothing, but its hours are still hours
          used: usedAmount(minutes, p.billable ? p.hourly_rate : 0, unit),
        });
      }
      return out;
    }),
});
