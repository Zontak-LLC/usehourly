import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { DATE_RE, isRealDate, MAX_QUERY_DAYS, spanDays } from "@/lib/dates";
import { isDemoSession } from "@/lib/demo";
import { parseDuration } from "@/lib/duration";
import { hashToken } from "@/lib/email-token";
import { NOTE_MAX } from "@/lib/notes";
import { assertWithinQuota } from "@/lib/quotas";
import { describeWait, hitRateLimit } from "@/lib/rate-limit";
import { MAX_TEAMS_JOINED } from "@/lib/team";

import { activeMembership } from "../team";
import { protectedProcedure, router } from "../trpc";

const nowSeconds = () => Math.floor(Date.now() / 1000);
const dateSchema = z.string().regex(DATE_RE, "Use YYYY-MM-DD").refine(isRealDate, "That is not a real date.");
const teamId = z.string().max(100);
const NOT_AVAILABLE = "This invitation isn't available any more.";

/**
 * The member's side. Everything here runs as the signed-in member: a team's entries belong to its OWNER (user_id) and
 * carry the member as author_id. Nothing returns rates, invoices, other clients or other people's entries.
 */
export const memberRouter = router({
  /** Joins a team by invitation link. One conditional update claims it, so a link works once. */
  accept: protectedProcedure
    .input(z.object({ token: z.string().min(20).max(100) }))
    .mutation(async ({ ctx, input }) => {
      if (isDemoSession(ctx.session)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Create a free account to join a team." });
      }
      const limit = await hitRateLimit(ctx.prisma, `team-accept:${ctx.userId}`, 10, 3600);
      if (!limit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many tries. Try again in ${describeWait(limit.retryAfterSeconds)}.`,
        });
      }
      const now = nowSeconds();
      const invite = await ctx.prisma.teamMember.findUnique({ where: { token_hash: await hashToken(input.token) } });
      if (!invite || invite.revoked_at !== null || invite.member_id !== null || (invite.expires_at ?? 0) <= now) {
        throw new TRPCError({ code: "NOT_FOUND", message: NOT_AVAILABLE });
      }
      if (invite.owner_id === ctx.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't join your own team." });
      }
      const joined = await ctx.prisma.teamMember.count({ where: { member_id: ctx.userId, revoked_at: null } });
      if (joined >= MAX_TEAMS_JOINED) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `You can be on up to ${MAX_TEAMS_JOINED} teams.` });
      }
      const claimed = await ctx.prisma.teamMember.updateMany({
        where: { id: invite.id, member_id: null, revoked_at: null, expires_at: { gt: now } },
        data: { member_id: ctx.userId, accepted_at: now, token_hash: null, expires_at: null },
      });
      if (claimed.count !== 1) throw new TRPCError({ code: "NOT_FOUND", message: NOT_AVAILABLE });
      const owner = await ctx.prisma.authUser.findUnique({
        where: { id: invite.owner_id },
        select: { name: true, business_name: true },
      });
      return { teamId: invite.id, ownerName: owner?.business_name?.trim() || owner?.name?.trim() || "your team" };
    }),

  /** The teams this person is on, with the clients and open projects they may log time on (names only, no rates). */
  teams: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.teamMember.findMany({
      where: { member_id: ctx.userId, revoked_at: null },
      include: {
        owner: { select: { name: true, business_name: true } },
        clients: {
          select: {
            client: {
              select: {
                id: true,
                name: true,
                color: true,
                projects: { where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } },
              },
            },
          },
        },
      },
      orderBy: { created_at: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      ownerName: r.owner.business_name?.trim() || r.owner.name?.trim() || "Team",
      clients: r.clients.map((c) => c.client).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }),

  /** Logs time for the team's owner as this member. Sending the same `clientId` twice saves one entry. */
  log: protectedProcedure
    .input(
      z
        .object({
          teamId,
          projectId: z.string().max(100),
          date: dateSchema,
          minutes: z.number().int().min(1).max(1440).optional(),
          duration: z.string().max(40).optional(),
          note: z.string().trim().max(NOTE_MAX).default(""),
          clientId: z.string().uuid().optional(),
        })
        .refine((v) => v.minutes !== undefined || v.duration !== undefined, { message: "Enter a duration." }),
    )
    .mutation(async ({ ctx, input }) => {
      const team = await activeMembership(ctx.prisma, ctx.userId, input.teamId);
      const mine = { user_id: team.ownerId, author_id: ctx.userId };
      if (input.clientId) {
        const already = await ctx.prisma.timeEntry.findFirst({ where: { id: input.clientId, ...mine } });
        if (already) return already;
      }
      const minutes = input.minutes ?? parseDuration(input.duration ?? "");
      if (!minutes || minutes < 1 || minutes > 1440) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Couldn't read that duration. Try 1.5, 1:30 or 90m." });
      }
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, user_id: team.ownerId, archived: false, client_id: { in: team.clientIds } },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      assertWithinQuota(await ctx.prisma.timeEntry.count({ where: { user_id: team.ownerId } }), 1, "entries");
      try {
        return await ctx.prisma.timeEntry.create({
          data: {
            ...(input.clientId ? { id: input.clientId } : {}),
            ...mine,
            project_id: project.id,
            date: input.date,
            minutes,
            note: input.note,
          },
        });
      } catch (err) {
        if (input.clientId) {
          const won = await ctx.prisma.timeEntry.findFirst({ where: { id: input.clientId, ...mine } });
          if (won) return won;
        }
        throw err;
      }
    }),

  /** This member's own entries for the team in [from, to], newest first. Nobody else's. */
  myEntries: protectedProcedure
    .input(
      z
        .object({ teamId, from: dateSchema, to: dateSchema })
        .refine((v) => v.from <= v.to && spanDays(v.from, v.to) <= MAX_QUERY_DAYS, {
          message: "Choose a range of up to a year.",
        }),
    )
    .query(async ({ ctx, input }) => {
      const team = await activeMembership(ctx.prisma, ctx.userId, input.teamId);
      const rows = await ctx.prisma.timeEntry.findMany({
        where: {
          user_id: team.ownerId,
          author_id: ctx.userId,
          date: { gte: input.from, lte: input.to },
          project: { client_id: { in: team.clientIds } },
        },
        select: {
          id: true,
          date: true,
          minutes: true,
          note: true,
          project: { select: { name: true, client: { select: { name: true } } } },
        },
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
      });
      return rows.map((r) => ({
        id: r.id,
        date: r.date,
        minutes: r.minutes,
        note: r.note,
        project: r.project.name,
        client: r.project.client.name,
      }));
    }),

  /** Deletes one of this member's own entries (only while they are still on the team). */
  deleteEntry: protectedProcedure
    .input(z.object({ teamId, id: z.string().max(100) }))
    .mutation(async ({ ctx, input }) => {
      const team = await activeMembership(ctx.prisma, ctx.userId, input.teamId);
      const done = await ctx.prisma.timeEntry.deleteMany({
        where: { id: input.id, user_id: team.ownerId, author_id: ctx.userId, started_at: null },
      });
      if (done.count !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found." });
      return { deleted: true };
    }),

  /** Leaves a team. The owner keeps the entries; the person can be invited again. */
  leave: protectedProcedure.input(z.object({ teamId })).mutation(async ({ ctx, input }) => {
    const done = await ctx.prisma.teamMember.updateMany({
      where: { id: input.teamId, member_id: ctx.userId, revoked_at: null },
      data: { revoked_at: nowSeconds() },
    });
    return { left: done.count };
  }),
});
