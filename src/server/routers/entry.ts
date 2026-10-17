import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { z } from "zod";

import { DATE_RE } from "@/lib/dates";
import { isDemoSession } from "@/lib/demo";
import { parseDuration } from "@/lib/duration";
import { planMerge } from "@/lib/merge-entries";
import { NOTE_MAX } from "@/lib/notes";
import { assertWithinQuota } from "@/lib/quotas";

import { protectedProcedure, router } from "../trpc";

const dateSchema = z.string().regex(DATE_RE, "Use YYYY-MM-DD");
const minutesSchema = z
  .number()
  .int()
  .min(1)
  .max(24 * 60);
const noteSchema = z.string().trim().max(NOTE_MAX).default("");

/** Refuses a write that would take the account past its entry limit (see lib/quotas.ts). */
async function assertEntryQuota(
  ctx: { prisma: PrismaClient; userId: string; session: Session | null },
  adding: number,
) {
  assertWithinQuota(
    await ctx.prisma.timeEntry.count({ where: { user_id: ctx.userId } }),
    adding,
    "entries",
    isDemoSession(ctx.session),
  );
}

// Logos are large; they travel separately (project.logos / clients.get), never with entries.
const withProject = {
  project: { omit: { logo: true }, include: { client: { omit: { logo: true } } } },
} as const;

export const entryRouter = router({
  /** Entries in [from, to] inclusive, newest first. */
  list: protectedProcedure.input(z.object({ from: dateSchema, to: dateSchema })).query(({ ctx, input }) =>
    ctx.prisma.timeEntry.findMany({
      where: { user_id: ctx.userId, date: { gte: input.from, lte: input.to } },
      include: withProject,
      orderBy: [{ date: "desc" }, { created_at: "desc" }],
    }),
  ),

  /** Quick-add. Accepts either `minutes` or free-form `duration` text ("1.5", "1:30", "90m"). */
  create: protectedProcedure
    .input(
      z
        .object({
          projectId: z.string(),
          date: dateSchema,
          minutes: minutesSchema.optional(),
          duration: z.string().optional(),
          note: noteSchema,
        })
        .refine((v) => v.minutes !== undefined || v.duration !== undefined, { message: "Enter a duration." }),
    )
    .mutation(async ({ ctx, input }) => {
      const minutes = input.minutes ?? parseDuration(input.duration ?? "");
      if (!minutes || minutes < 1 || minutes > 24 * 60) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Couldn't read that duration. Try 1.5, 1:30 or 90m." });
      }
      const project = await ctx.prisma.project.findFirst({ where: { id: input.projectId, user_id: ctx.userId } });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      await assertEntryQuota(ctx, 1);
      return ctx.prisma.timeEntry.create({
        data: { user_id: ctx.userId, project_id: project.id, date: input.date, minutes, note: input.note },
        include: withProject,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string().optional(),
        date: dateSchema.optional(),
        minutes: minutesSchema.optional(),
        note: z.string().trim().max(NOTE_MAX).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.timeEntry.findFirst({ where: { id: input.id, user_id: ctx.userId } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found." });
      if (input.projectId) {
        const p = await ctx.prisma.project.findFirst({ where: { id: input.projectId, user_id: ctx.userId } });
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      }
      return ctx.prisma.timeEntry.update({
        where: { id: input.id },
        data: {
          ...(input.projectId && { project_id: input.projectId }),
          ...(input.date && { date: input.date }),
          ...(input.minutes && { minutes: input.minutes }),
          ...(input.note !== undefined && { note: input.note }),
        },
        include: withProject,
      });
    }),

  /**
   * Set one project's total for several days at once (grid cell edit and multi-day fill).
   * minutes > 0 creates or updates the day's single entry; 0 clears it. Days that hold
   * several entries or a running timer are skipped and reported — never silently merged.
   */
  bulkSet: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cells: z
          .array(
            z.object({
              date: dateSchema,
              minutes: z
                .number()
                .int()
                .min(0)
                .max(24 * 60),
            }),
          )
          .min(1)
          .max(31),
        // Description applied to every day this call writes. Left out (or blank), existing
        // descriptions are never touched.
        note: z.string().trim().max(NOTE_MAX).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({ where: { id: input.projectId, user_id: ctx.userId } });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      const note = input.note || undefined;
      await assertEntryQuota(ctx, input.cells.filter((c) => c.minutes > 0).length);

      const wanted = new Map(input.cells.map((c) => [c.date, c.minutes])); // last write wins per date
      const existing = await ctx.prisma.timeEntry.findMany({
        where: { user_id: ctx.userId, project_id: project.id, date: { in: [...wanted.keys()] } },
      });
      const byDate = new Map<string, typeof existing>();
      for (const e of existing) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

      const result = { created: 0, updated: 0, deleted: 0, skipped: [] as string[] };
      for (const [date, minutes] of wanted) {
        const rows = byDate.get(date) ?? [];
        if (rows.length > 1 || rows.some((r) => r.started_at)) {
          result.skipped.push(date);
        } else if (rows.length === 0) {
          if (minutes > 0) {
            await ctx.prisma.timeEntry.create({
              data: { user_id: ctx.userId, project_id: project.id, date, minutes, ...(note && { note }) },
            });
            result.created++;
          }
        } else if (minutes === 0) {
          await ctx.prisma.timeEntry.deleteMany({ where: { id: rows[0].id, user_id: ctx.userId } });
          result.deleted++;
        } else if (rows[0].minutes !== minutes || (note !== undefined && rows[0].note !== note)) {
          await ctx.prisma.timeEntry.update({
            where: { id: rows[0].id },
            data: { minutes, ...(note && { note }) },
          });
          result.updated++;
        }
      }
      return result;
    }),

  /**
   * Quick-create: the same entry (project, hours, note) on several days at once. Always adds
   * new entries rather than merging. With `skipExisting` (default), days that already have time
   * for this project are left alone and reported, so a double-click can't double-log a day.
   */
  createMany: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        dates: z.array(dateSchema).min(1).max(31),
        minutes: minutesSchema,
        note: noteSchema,
        skipExisting: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({ where: { id: input.projectId, user_id: ctx.userId } });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });

      const dates = [...new Set(input.dates)].sort();
      await assertEntryQuota(ctx, dates.length);
      const taken = new Set<string>();
      if (input.skipExisting) {
        const existing = await ctx.prisma.timeEntry.findMany({
          where: { user_id: ctx.userId, project_id: project.id, date: { in: dates } },
          select: { date: true },
        });
        for (const e of existing) taken.add(e.date);
      }

      const result = { created: 0, skipped: [] as string[] };
      for (const date of dates) {
        if (taken.has(date)) {
          result.skipped.push(date);
          continue;
        }
        await ctx.prisma.timeEntry.create({
          data: { user_id: ctx.userId, project_id: project.id, date, minutes: input.minutes, note: input.note },
        });
        result.created++;
      }
      return result;
    }),

  /**
   * Fold several entries (same project, same day) into the first one: hours summed, descriptions
   * joined. All rows must belong to the caller. The kept entry is updated before the others are
   * removed, so a failure part-way can only leave extra rows, never lose time.
   */
  merge: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(2).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const ids = [...new Set(input.ids)];
      const rows = await ctx.prisma.timeEntry.findMany({ where: { id: { in: ids }, user_id: ctx.userId } });
      if (rows.length !== ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found." });
      const ordered = ids.map((id) => rows.find((r) => r.id === id)!);
      const plan = planMerge(ordered);
      if ("error" in plan) throw new TRPCError({ code: "BAD_REQUEST", message: plan.error });
      await ctx.prisma.timeEntry.update({
        where: { id: plan.keepId },
        data: { minutes: plan.minutes, note: plan.note },
      });
      await ctx.prisma.timeEntry.deleteMany({ where: { id: { in: plan.deleteIds }, user_id: ctx.userId } });
      return { id: plan.keepId, minutes: plan.minutes, merged: plan.deleteIds.length + 1 };
    }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.prisma.timeEntry.deleteMany({ where: { id: input.id, user_id: ctx.userId } });
    if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found." });
    return { ok: true };
  }),

  /** The user's currently running timer, if any. */
  running: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.timeEntry.findFirst({
      where: { user_id: ctx.userId, started_at: { not: null } },
      include: withProject,
    }),
  ),

  /** Start a timer. Any already-running timer is stopped first so only one runs at a time. */
  start: protectedProcedure
    .input(z.object({ projectId: z.string(), date: dateSchema, note: noteSchema }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({ where: { id: input.projectId, user_id: ctx.userId } });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      await assertEntryQuota(ctx, 1);
      const now = new Date();
      const running = await ctx.prisma.timeEntry.findFirst({
        where: { user_id: ctx.userId, started_at: { not: null } },
      });
      if (running?.started_at) {
        await ctx.prisma.timeEntry.update({
          where: { id: running.id },
          data: { minutes: running.minutes + elapsedMinutes(running.started_at, now), started_at: null },
        });
      }
      return ctx.prisma.timeEntry.create({
        data: { user_id: ctx.userId, project_id: project.id, date: input.date, note: input.note, started_at: now },
        include: withProject,
      });
    }),

  /** Stop the running timer; elapsed time is rounded up to the next minute (min 1). */
  stop: protectedProcedure.mutation(async ({ ctx }) => {
    const running = await ctx.prisma.timeEntry.findFirst({
      where: { user_id: ctx.userId, started_at: { not: null } },
    });
    if (!running?.started_at) throw new TRPCError({ code: "NOT_FOUND", message: "No timer is running." });
    return ctx.prisma.timeEntry.update({
      where: { id: running.id },
      data: { minutes: running.minutes + elapsedMinutes(running.started_at, new Date()), started_at: null },
      include: withProject,
    });
  }),
});

function elapsedMinutes(from: Date, to: Date): number {
  return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 60_000));
}
