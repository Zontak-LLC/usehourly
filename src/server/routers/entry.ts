import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { z } from "zod";

import { DATE_RE, isRealDate, MAX_QUERY_DAYS, spanDays } from "@/lib/dates";
import { isDemoSession } from "@/lib/demo";
import { parseDuration } from "@/lib/duration";
import { planMerge } from "@/lib/merge-entries";
import { NOTE_MAX } from "@/lib/notes";
import { assertWithinQuota } from "@/lib/quotas";

import { drillError, faultActive } from "../drill";
import { nonBillableDates } from "../non-billable";
import { accountQuota, insertWithinQuota, QuotaInsertDuplicate } from "../quota-insert";
import { protectedProcedure, router } from "../trpc";

const dateSchema = z.string().regex(DATE_RE, "Use YYYY-MM-DD").refine(isRealDate, "That is not a real date.");
/** Entries the global search shows. */
const ENTRY_SEARCH_LIMIT = 8;
/** Entries per page of `listAll`. */
const LIST_ALL_PAGE = 2_000;

const minutesSchema = z
  .number()
  .int()
  .min(1)
  .max(24 * 60);
const noteSchema = z.string().trim().max(NOTE_MAX).default("");

/** "Started earlier?" moves a start back at most this far (and never to more than this long ago). */
const MAX_SHIFT_MINUTES = 12 * 60;

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

/** The account's entries against its limit, for a one-statement guarded insert (server/quota-insert.ts). */
function entryQuota(ctx: { userId: string; session: Session | null }) {
  return accountQuota("time_entries", "entries", ctx.userId, isDemoSession(ctx.session));
}

// Logos are large; they travel separately (project.logos / clients.get), never with entries.
const withProject = {
  project: { omit: { logo: true }, include: { client: { omit: { logo: true } } } },
} as const;

/** A date range of at most a year, start before end. */
const inRange = <T extends z.ZodType<{ from: string; to: string }>>(schema: T) =>
  schema
    .refine((v) => v.from <= v.to, { message: "The start date must be before the end date." })
    .refine((v) => spanDays(v.from, v.to) <= MAX_QUERY_DAYS, {
      message: `Choose a range of up to a year (${MAX_QUERY_DAYS} days).`,
    });
const rangeSchema = inRange(z.object({ from: dateSchema, to: dateSchema }));
/** `clientId` keeps only that client's entries (the invoice builder asks for one client's year, not the account's). */
const listSchema = inRange(
  z.object({ from: dateSchema, to: dateSchema, clientId: z.string().min(1).max(64).optional() }),
);

export const entryRouter = router({
  /**
   * Entries in [from, to] inclusive, newest first. At most a year at a time (see `listAll` for everything). Each entry
   * carries `non_billable`: true when its day is marked non-billable (exports, reports and invoices skip those).
   */
  list: protectedProcedure.input(listSchema).query(async ({ ctx, input }) => {
    // A staging drill only (lib/drill.ts); on production this returns false without a database read.
    if (await faultActive(ctx.prisma, "entry-list-500")) throw drillError("no such table: time_entries");
    // Four independent reads started together (one round trip, not a chain): the entries, the non-billable days, the
    // account's projects and its clients. Letting Prisma join them itself (`include`) would run entries, then projects,
    // then clients, one after another, and D1 charges a round trip for each. Every read is filtered by the account.
    const [rows, days, projects, clients] = await Promise.all([
      ctx.prisma.timeEntry.findMany({
        where: {
          user_id: ctx.userId,
          date: { gte: input.from, lte: input.to },
          ...(input.clientId ? { project: { client_id: input.clientId, user_id: ctx.userId } } : {}),
        },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
      }),
      nonBillableDates(ctx.prisma, ctx.userId, { from: input.from, to: input.to }),
      ctx.prisma.project.findMany({ where: { user_id: ctx.userId }, omit: { logo: true } }),
      ctx.prisma.client.findMany({ where: { user_id: ctx.userId }, omit: { logo: true } }),
    ]);
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const byId = new Map(
      projects.flatMap((p) => {
        const client = clientById.get(p.client_id);
        return client ? [[p.id, { ...p, client }] as const] : [];
      }),
    );
    // `author` is the team member who typed the entry (null for the owner's own): looked up only when there is one.
    const authorIds = [...new Set(rows.flatMap((e) => (e.author_id ? [e.author_id] : [])))];
    const authors = authorIds.length
      ? await ctx.prisma.authUser.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
      : [];
    const authorName = new Map(authors.map((a) => [a.id, a.name]));
    return rows.flatMap((e) => {
      const project = byId.get(e.project_id);
      if (!project) return []; // cannot happen (an entry's project is deleted with it); never show a half-built row
      const author = e.author_id ? { name: authorName.get(e.author_id) ?? null } : null;
      return [{ ...e, project, author, non_billable: days.has(e.date) }];
    });
  }),

  /**
   * Time entries whose description holds every word typed (the global search in the top bar). Newest first, a handful at
   * most, and only ever the caller's own entries and projects.
   */
  search: protectedProcedure.input(z.object({ q: z.string().trim().min(2).max(100) })).query(async ({ ctx, input }) => {
    const words = input.q.split(/\s+/).filter(Boolean).slice(0, 4);
    const rows = await ctx.prisma.timeEntry.findMany({
      where: { user_id: ctx.userId, AND: words.map((w) => ({ note: { contains: w } })) },
      orderBy: [{ date: "desc" }, { created_at: "desc" }],
      take: ENTRY_SEARCH_LIMIT,
    });
    if (rows.length === 0) return [];
    const projects = await ctx.prisma.project.findMany({
      where: { user_id: ctx.userId, id: { in: [...new Set(rows.map((e) => e.project_id))] } },
      omit: { logo: true },
      include: { client: { omit: { logo: true } } },
    });
    const byId = new Map(projects.map((p) => [p.id, p]));
    return rows.flatMap((e) => {
      const project = byId.get(e.project_id);
      if (!project) return [];
      return [
        {
          id: e.id,
          date: e.date,
          minutes: e.minutes,
          note: e.note,
          project: project.name,
          client: project.client.name,
        },
      ];
    });
  }),

  /** The dates in [from, to] the account has marked non-billable, oldest first. */
  nonBillableDays: protectedProcedure
    .input(rangeSchema)
    .query(async ({ ctx, input }) => [...(await nonBillableDates(ctx.prisma, ctx.userId, input))].sort()),

  /** Marks (or un-marks) one day non-billable. Nothing about the day's entries changes; marking twice is harmless. */
  setNonBillable: protectedProcedure
    .input(z.object({ date: dateSchema, nonBillable: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const key = { user_id_date: { user_id: ctx.userId, date: input.date } };
      if (input.nonBillable) {
        const already = await ctx.prisma.nonBillableDay.findUnique({ where: key });
        if (!already) {
          assertWithinQuota(
            await ctx.prisma.nonBillableDay.count({ where: { user_id: ctx.userId } }),
            1,
            "nonBillableDays",
            isDemoSession(ctx.session),
          );
          await ctx.prisma.nonBillableDay.create({ data: { user_id: ctx.userId, date: input.date } });
        }
      } else {
        await ctx.prisma.nonBillableDay.deleteMany({ where: { user_id: ctx.userId, date: input.date } });
      }
      return { date: input.date, nonBillable: input.nonBillable };
    }),

  /**
   * Every entry, a page at a time (for "export everything"). Pass the previous page's `nextCursor`
   * until it comes back null. A page is bounded, so no single response can be enormous.
   */
  listAll: protectedProcedure
    .input(z.object({ cursor: z.string().max(100).nullish() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.timeEntry.findMany({
        where: { user_id: ctx.userId },
        include: withProject,
        orderBy: [{ date: "desc" }, { created_at: "desc" }, { id: "asc" }],
        take: LIST_ALL_PAGE + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 0 } : {}),
      });
      const more = rows.length > LIST_ALL_PAGE;
      const days = await nonBillableDates(ctx.prisma, ctx.userId);
      const items = (more ? rows.slice(0, LIST_ALL_PAGE) : rows).map((e) => ({ ...e, non_billable: days.has(e.date) }));
      return { items, nextCursor: more ? rows[LIST_ALL_PAGE].id : null };
    }),

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
          /**
           * An id the browser made for this entry (a UUID). Sending the same one twice saves the entry once: a retry after a
           * dropped connection (or an entry that waited offline and was sent again) returns the saved entry, never a copy.
           */
          clientId: z.string().uuid().optional(),
        })
        .refine((v) => v.minutes !== undefined || v.duration !== undefined, { message: "Enter a duration." }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.clientId) {
        const already = await ctx.prisma.timeEntry.findFirst({
          where: { id: input.clientId, user_id: ctx.userId },
          include: withProject,
        });
        if (already) return already;
      }
      const minutes = input.minutes ?? parseDuration(input.duration ?? "");
      if (!minutes || minutes < 1 || minutes > 24 * 60) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Couldn't read that duration. Try 1.5, 1:30 or 90m." });
      }
      const project = await ctx.prisma.project.findFirst({ where: { id: input.projectId, user_id: ctx.userId } });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      try {
        const id = await insertWithinQuota(
          ctx.prisma,
          "time_entries",
          {
            id: input.clientId,
            user_id: ctx.userId,
            project_id: project.id,
            date: input.date,
            minutes,
            note: input.note,
          },
          entryQuota(ctx),
        );
        return await ctx.prisma.timeEntry.findUniqueOrThrow({ where: { id }, include: withProject });
      } catch (err) {
        // Two sends of the same entry at once: the other one won, so hand back what it saved.
        if (input.clientId) {
          const won = await ctx.prisma.timeEntry.findFirst({
            where: { id: input.clientId, user_id: ctx.userId },
            include: withProject,
          });
          if (won) return won;
        }
        throw err;
      }
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
        where: { id: input.id, user_id: ctx.userId },
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
            where: { id: rows[0].id, user_id: ctx.userId },
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
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ordered = ids.flatMap((id) => byId.get(id) ?? []);
      if (ordered.length !== ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found." });
      // Merging billed and unbilled time would bill hours twice or never: only entries on the same invoice (or on none).
      if (new Set(rows.map((r) => r.invoice_id ?? "")).size > 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Some of these entries are already on an invoice and some are not, so they can't be merged.",
        });
      }
      const plan = planMerge(ordered);
      if ("error" in plan) throw new TRPCError({ code: "BAD_REQUEST", message: plan.error });
      await ctx.prisma.timeEntry.update({
        where: { id: plan.keepId, user_id: ctx.userId },
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

  /** Whether the account has any entry at all (Today's import hint shows only before the first one). */
  hasAny: protectedProcedure.query(async ({ ctx }) => {
    const first = await ctx.prisma.timeEntry.findFirst({ where: { user_id: ctx.userId }, select: { id: true } });
    return first !== null;
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
          where: { id: running.id, user_id: ctx.userId },
          data: { minutes: stoppedMinutes(running.minutes, running.started_at, now), started_at: null },
        });
      }
      try {
        // The check above refuses early without stopping anything; this one-statement guard decides a race. Losing one
        // at exactly the limit leaves the old timer stopped with its minutes saved, and shows the limit message.
        const id = await insertWithinQuota(
          ctx.prisma,
          "time_entries",
          { user_id: ctx.userId, project_id: project.id, date: input.date, note: input.note, started_at: now },
          entryQuota(ctx),
        );
        return await ctx.prisma.timeEntry.findUniqueOrThrow({ where: { id }, include: withProject });
      } catch (e) {
        // A parallel "start" got there first: the database allows one running timer per account (migration 0024).
        if (e instanceof QuotaInsertDuplicate) {
          throw new TRPCError({ code: "CONFLICT", message: "A timer is already running. Stop it first." });
        }
        throw e;
      }
    }),

  /**
   * Resume a stopped entry: its timer runs again and the next stop adds the new time to what it already holds. Any other
   * running timer is stopped first (one timer at a time). Used by Today's "Resume" after a stop.
   */
  resume: protectedProcedure.input(z.object({ id: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
    const entry = await ctx.prisma.timeEntry.findFirst({ where: { id: input.id, user_id: ctx.userId } });
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found." });
    if (entry.minutes >= MAX_ENTRY_MINUTES) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This entry already holds a full day." });
    }
    const now = new Date();
    if (!entry.started_at) {
      const running = await ctx.prisma.timeEntry.findFirst({
        where: { user_id: ctx.userId, started_at: { not: null } },
      });
      if (running?.started_at) {
        await ctx.prisma.timeEntry.update({
          where: { id: running.id, user_id: ctx.userId },
          data: { minutes: stoppedMinutes(running.minutes, running.started_at, now), started_at: null },
        });
      }
    }
    try {
      return await ctx.prisma.timeEntry.update({
        where: { id: entry.id, user_id: ctx.userId },
        data: { started_at: entry.started_at ?? now },
        include: withProject,
      });
    } catch (e) {
      if ((e as { code?: string } | null)?.code === "P2002") {
        throw new TRPCError({ code: "CONFLICT", message: "A timer is already running. Stop it first." });
      }
      throw e;
    }
  }),

  /**
   * Stop the running timer; elapsed time is rounded up to the next minute (min 1). `minutesAgo` stops it at an earlier
   * moment ("Still working?" after a long run): the entry then holds only the time up to that moment, never more than ran.
   */
  stop: protectedProcedure
    .input(
      z
        .object({
          minutesAgo: z
            .number()
            .int()
            .min(1)
            .max(24 * 60)
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const running = await ctx.prisma.timeEntry.findFirst({
        where: { user_id: ctx.userId, started_at: { not: null } },
      });
      if (!running?.started_at) throw new TRPCError({ code: "NOT_FOUND", message: "No timer is running." });
      const end = new Date(Date.now() - (input?.minutesAgo ?? 0) * 60_000);
      if (end.getTime() <= running.started_at.getTime()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The timer had not started then. Pick a later time." });
      }
      return ctx.prisma.timeEntry.update({
        where: { id: running.id, user_id: ctx.userId },
        data: { minutes: stoppedMinutes(running.minutes, running.started_at, end), started_at: null },
        include: withProject,
      });
    }),

  /**
   * "Started earlier?": moves the running timer's start back by `minutes` (Today's -15 min / -30 min / -1 h chips). Only
   * the caller's own running timer; the new start may not be in the future, more than 12 hours ago, or on the day before
   * the timer's start (local time, from the browser's `tzOffset`, as `Date.getTimezoneOffset()` gives it).
   */
  shiftStart: protectedProcedure
    .input(
      z.object({
        minutes: z.number().int().min(1).max(MAX_SHIFT_MINUTES),
        tzOffset: z.number().int().min(-840).max(840),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const running = await ctx.prisma.timeEntry.findFirst({
        where: { user_id: ctx.userId, started_at: { not: null } },
      });
      if (!running?.started_at) throw new TRPCError({ code: "NOT_FOUND", message: "No timer is running." });
      const now = Date.now();
      const next = new Date(running.started_at.getTime() - input.minutes * 60_000);
      if (next.getTime() > now)
        throw new TRPCError({ code: "BAD_REQUEST", message: "The start can't be in the future." });
      if (now - next.getTime() > MAX_SHIFT_MINUTES * 60_000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A timer can start at most 12 hours ago. Log the earlier time as its own entry.",
        });
      }
      if (localDate(next, input.tzOffset) !== localDate(running.started_at, input.tzOffset)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That would move the start to the day before. Log the earlier time as its own entry.",
        });
      }
      try {
        // Only if the start is still the one read above: a stop or another shift in between wins, nothing is doubled.
        return await ctx.prisma.timeEntry.update({
          where: { id: running.id, user_id: ctx.userId, started_at: running.started_at },
          data: { started_at: next },
          include: withProject,
        });
      } catch (e) {
        if ((e as { code?: string } | null)?.code === "P2025") {
          throw new TRPCError({ code: "CONFLICT", message: "The timer changed. Please try again." });
        }
        throw e;
      }
    }),
});

/** The local calendar date of a moment, for a browser `getTimezoneOffset()` value (minutes behind UTC). */
function localDate(at: Date, tzOffset: number): string {
  return new Date(at.getTime() - tzOffset * 60_000).toISOString().slice(0, 10);
}

/** A day is the most one entry can hold (the same limit every other way of adding time has). */
const MAX_ENTRY_MINUTES = 24 * 60;

function elapsedMinutes(from: Date, to: Date): number {
  return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 60_000));
}

/** What a stopped timer leaves in its entry: the minutes already there plus the elapsed time, never over a day. */
function stoppedMinutes(banked: number, from: Date, to: Date): number {
  return Math.min(MAX_ENTRY_MINUTES, banked + elapsedMinutes(from, to));
}
