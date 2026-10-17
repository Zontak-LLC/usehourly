import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { isDemoSession } from "@/lib/demo";
import { assertWithinQuota } from "@/lib/quotas";

import { projectLogoSchema } from "../logo-schema";
import { protectedProcedure, router } from "../trpc";

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
      const dup = await ctx.prisma.project.findFirst({ where: { client_id: client.id, name: input.name } });
      if (dup)
        throw new TRPCError({ code: "CONFLICT", message: `"${client.name}" already has a project "${input.name}".` });
      assertWithinQuota(
        await ctx.prisma.project.count({ where: { user_id: ctx.userId } }),
        1,
        "projects",
        isDemoSession(ctx.session),
      );
      return ctx.prisma.project.create({
        data: {
          user_id: ctx.userId,
          client_id: client.id,
          name: input.name,
          hourly_rate: input.hourlyRate,
          billable: input.billable,
        },
      });
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
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(80).optional(),
        clientId: z.string().optional(),
        hourlyRate: z.number().int().min(0).max(10_000_00).optional(),
        billable: z.boolean().optional(),
        // undefined = leave as is; null = remove the logo.
        logo: projectLogoSchema.optional(),
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
        where: { id: project.id },
        data: {
          name,
          client_id: clientId,
          ...(input.hourlyRate !== undefined && { hourly_rate: input.hourlyRate }),
          ...(input.billable !== undefined && { billable: input.billable }),
          ...(input.logo !== undefined && { logo: input.logo }),
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
    await ctx.prisma.project.update({ where: { id: project.id }, data: { archived: false } });
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
        ctx.prisma.timeEntry.groupBy({ by: ["project_id"], where: { user_id: ctx.userId }, _sum: { minutes: true } }),
        ctx.prisma.timeEntry.groupBy({
          by: ["project_id"],
          where: { user_id: ctx.userId, date: { gte: input.from, lte: input.to } },
          _sum: { minutes: true },
        }),
      ]);
      const out: Record<string, { total: number; range: number }> = {};
      for (const r of all) out[r.project_id] = { total: r._sum.minutes ?? 0, range: 0 };
      for (const r of range) {
        const entry = out[r.project_id] ?? { total: 0, range: 0 };
        entry.range = r._sum.minutes ?? 0;
        out[r.project_id] = entry;
      }
      return out;
    }),
});
