import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { DATE_RE, isRealDate, MAX_QUERY_DAYS, spanDays } from "@/lib/dates";
import { isDemoSession } from "@/lib/demo";
import { hashToken, newToken } from "@/lib/email-token";
import { describeRange } from "@/lib/export-range";
import { logError } from "@/lib/log";
import { timesheetApprovedMessage } from "@/lib/mailer";
import { describeWait, hitRateLimit } from "@/lib/rate-limit";
import {
  approvalSchema,
  buildShareSnapshot,
  DEFAULT_SHARE_EXPIRY_DAYS,
  MAX_LIVE_SHARES,
  MAX_SNAPSHOT_CHARS,
  SHARE_EXPIRY_DAYS,
  shareStatus,
} from "@/lib/timesheet-share";

import { findShareByToken } from "../timesheet-share";
import { type Context, protectedProcedure, publicProcedure, router } from "../trpc";

const dateSchema = z.string().regex(DATE_RE, "Use YYYY-MM-DD").refine(isRealDate, "That is not a real date.");
const nowSeconds = () => Math.floor(Date.now() / 1000);
const UNAVAILABLE = "This link isn't available any more.";

/** Hours only: the project and client names, never rates (hourly_rate is read only to satisfy the sheet's type). */
const forSheet = {
  project: {
    select: {
      name: true,
      hourly_rate: true,
      billable: true,
      client: { select: { name: true, color: true } },
    },
  },
} as const;

/**
 * Lets the freelancer know, once, that their client approved. Best effort: a failed email never undoes or fails the
 * approval. It goes only to an address the owner confirmed and that has not bounced, so nobody can use a sheet to
 * send mail to an address they merely registered.
 */
async function tellOwner(
  ctx: Pick<Context, "prisma" | "mailer" | "baseUrl">,
  share: { id: string; user_id: string; title: string },
  input: { name: string; note?: string },
) {
  if (!ctx.mailer) return;
  try {
    const owner = await ctx.prisma.authUser.findUnique({
      where: { id: share.user_id },
      select: { email: true, email_verified_at: true, email_bounced_at: true, is_demo: true },
    });
    if (!owner || owner.is_demo || owner.email_verified_at === null || owner.email_bounced_at !== null) return;
    await ctx.mailer.send(
      timesheetApprovedMessage(owner.email, {
        approver: input.name,
        title: share.title,
        note: input.note || null,
        link: `${ctx.baseUrl ?? ""}/dashboard/week`,
      }),
    );
  } catch (err) {
    logError("approval_email_failed", err);
  }
}

export const timesheetShareRouter = router({
  /**
   * Freezes the hours of a date range (optionally one client or project) into a private link for the client to
   * review and approve. Recomputed here from the account's own entries; the browser only says which range.
   * The link is returned once: only its hash is stored.
   */
  create: protectedProcedure
    .input(
      z
        .object({
          from: dateSchema,
          to: dateSchema,
          projectId: z.string().max(100).optional(),
          clientId: z.string().max(100).optional(),
          includeNotes: z.boolean().default(true),
          expiresInDays: z
            .number()
            .refine((n) => (SHARE_EXPIRY_DAYS as readonly number[]).includes(n), "Choose 7, 30 or 90 days.")
            .default(DEFAULT_SHARE_EXPIRY_DAYS),
          title: z.string().trim().max(120).optional(),
        })
        .refine((v) => v.from <= v.to, { message: "The start date must be before the end date." })
        .refine((v) => spanDays(v.from, v.to) <= MAX_QUERY_DAYS, {
          message: `Choose a range of up to a year (${MAX_QUERY_DAYS} days).`,
        }),
    )
    .mutation(async ({ ctx, input }) => {
      if (isDemoSession(ctx.session)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Create a free account to share timesheets with clients." });
      }
      const now = nowSeconds();
      const live = await ctx.prisma.timesheetShare.count({
        where: { user_id: ctx.userId, revoked_at: null, expires_at: { gt: now } },
      });
      if (live >= MAX_LIVE_SHARES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You have ${MAX_LIVE_SHARES} live timesheet links. Revoke some before making more.`,
        });
      }
      const entries = await ctx.prisma.timeEntry.findMany({
        where: {
          user_id: ctx.userId,
          date: { gte: input.from, lte: input.to },
          ...(input.projectId ? { project_id: input.projectId } : {}),
          ...(input.clientId ? { project: { client_id: input.clientId } } : {}),
        },
        include: forSheet,
        orderBy: [{ date: "asc" }, { created_at: "asc" }],
      });
      const owner = await ctx.prisma.authUser.findUnique({
        where: { id: ctx.userId },
        select: { name: true, business_name: true },
      });
      const ownerName = owner?.business_name?.trim() || owner?.name?.trim() || "A UseHourly user";
      const clients = new Set(entries.map((e) => e.project.client.name));
      const scope = clients.size === 1 ? [...clients][0] : "All clients";
      const snapshot = buildShareSnapshot({
        owner: ownerName,
        title: input.title || `${scope} · ${describeRange(input.from, input.to)}`,
        from: input.from,
        to: input.to,
        entries,
        includeNotes: input.includeNotes,
      });
      if (snapshot.total === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "There is no logged time in that range to share." });
      }
      const json = JSON.stringify(snapshot);
      if (json.length > MAX_SNAPSHOT_CHARS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That is too much to share in one sheet. Choose a shorter range, or leave the notes out.",
        });
      }
      const token = newToken();
      const row = await ctx.prisma.timesheetShare.create({
        data: {
          user_id: ctx.userId,
          token_hash: await hashToken(token),
          token_prefix: token.slice(0, 6),
          title: snapshot.title,
          period_from: input.from,
          period_to: input.to,
          snapshot: json,
          expires_at: now + input.expiresInDays * 86_400,
        },
        select: { id: true },
      });
      return { id: row.id, token };
    }),

  /** The account's links, newest first, without the hours themselves. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const now = nowSeconds();
    const rows = await ctx.prisma.timesheetShare.findMany({
      where: { user_id: ctx.userId },
      orderBy: { created_at: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        period_from: true,
        period_to: true,
        token_prefix: true,
        created_at: true,
        expires_at: true,
        revoked_at: true,
        approved_name: true,
        approved_at: true,
      },
    });
    return rows.map((r) => ({ ...r, status: shareStatus(r, now) }));
  }),

  /** Turns a link off. The page it pointed at stops working at once. */
  revoke: protectedProcedure.input(z.object({ id: z.string().max(100) })).mutation(async ({ ctx, input }) => {
    const done = await ctx.prisma.timesheetShare.updateMany({
      where: { id: input.id, user_id: ctx.userId, revoked_at: null },
      data: { revoked_at: nowSeconds() },
    });
    if (done.count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "That link was not found." });
    return { revoked: true };
  }),

  /**
   * The client approves from the shared page; no sign-in. Throttled per connection and per link, and the claim is one
   * conditional update, so two clicks (or two people) can never both approve, and a revoked or expired link cannot.
   */
  approve: publicProcedure
    .input(approvalSchema.extend({ token: z.string().min(20).max(100) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.ip) {
        const r = await hitRateLimit(ctx.prisma, `share-approve-ip:${ctx.ip}`, 20, 3600);
        if (!r.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many tries. Please wait ${describeWait(r.retryAfterSeconds)}.`,
          });
        }
      }
      const share = await findShareByToken(ctx.prisma, input.token);
      if (!share) throw new TRPCError({ code: "NOT_FOUND", message: UNAVAILABLE });
      const perLink = await hitRateLimit(ctx.prisma, `share-approve:${share.id}`, 5, 3600);
      if (!perLink.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many tries on this link. Please try again later.",
        });
      }
      const now = nowSeconds();
      const status = shareStatus(share, now);
      if (status === "approved") {
        throw new TRPCError({ code: "CONFLICT", message: "This timesheet has already been approved." });
      }
      if (status !== "waiting") throw new TRPCError({ code: "NOT_FOUND", message: UNAVAILABLE });
      const claimed = await ctx.prisma.timesheetShare.updateMany({
        where: { id: share.id, approved_at: null, revoked_at: null, expires_at: { gt: now } },
        data: { approved_name: input.name, approved_note: input.note || null, approved_at: now },
      });
      if (claimed.count === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "This timesheet can no longer be approved." });
      }
      await tellOwner(ctx, share, input);
      return { approvedAt: now };
    }),
});
