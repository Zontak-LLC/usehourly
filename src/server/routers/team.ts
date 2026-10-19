import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { isDemoSession } from "@/lib/demo";
import { emailField, normalizeEmail } from "@/lib/email";
import { hashToken, newToken } from "@/lib/email-token";
import { appUrl } from "@/lib/mailer";
import { cleanLabel, INVITE_DAYS, MAX_TEAM_MEMBERS, memberStatus } from "@/lib/team";

import { emailInvite } from "../team-invite";
import { type Context, protectedProcedure, router } from "../trpc";

const nowSeconds = () => Math.floor(Date.now() / 1000);
const clientIds = z.array(z.string().max(100)).min(1, "Choose at least one client.").max(50);

type Ctx = Pick<Context, "prisma" | "mailer" | "baseUrl"> & { userId: string };

const sendTo = (ctx: Ctx, to: string, token: string) =>
  emailInvite({
    prisma: ctx.prisma,
    mailer: ctx.mailer ?? null,
    ownerId: ctx.userId,
    to,
    token,
    appUrl: ctx.baseUrl ?? appUrl(),
    secret: process.env.AUTH_SECRET ?? "",
  });

/** The owner's side: invite people, choose which clients they may log time on, remove them. */
export const teamRouter = router({
  /** Everyone invited, with the clients each may use. Never includes an invite link (only its hash is stored). */
  list: protectedProcedure.query(async ({ ctx }) => {
    const now = nowSeconds();
    const rows = await ctx.prisma.teamMember.findMany({
      where: { owner_id: ctx.userId },
      include: { clients: { select: { client_id: true } }, member: { select: { name: true } } },
      orderBy: { created_at: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      email: r.email,
      memberName: r.member?.name ?? null,
      status: memberStatus(r, now),
      clientIds: r.clients.map((c) => c.client_id),
      expiresAt: r.expires_at,
    }));
  }),

  /**
   * Invites a person by email address. The invitation always exists afterwards; UseHourly also emails them the link when
   * the sender passes the mail guards (see `emailInvite`), and says why not otherwise. The link is returned ONCE: only its
   * hash is stored. They need a UseHourly account to accept.
   */
  invite: protectedProcedure
    .input(z.object({ email: emailField, name: z.string().max(200).default(""), clientIds }))
    .mutation(async ({ ctx, input }) => {
      if (isDemoSession(ctx.session)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Create a free account to invite people." });
      }
      const email = normalizeEmail(input.email);
      const me = await ctx.prisma.authUser.findUnique({ where: { id: ctx.userId }, select: { email: true } });
      if (me && normalizeEmail(me.email) === email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That's your own address. Invite someone else." });
      }
      const ids = [...new Set(input.clientIds)];
      const owned = await ctx.prisma.client.count({ where: { user_id: ctx.userId, id: { in: ids } } });
      if (owned !== ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
      const taken = await ctx.prisma.teamMember.count({ where: { owner_id: ctx.userId, revoked_at: null } });
      if (taken >= MAX_TEAM_MEMBERS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You have ${MAX_TEAM_MEMBERS} people on your team. Remove someone before inviting more.`,
        });
      }
      const token = newToken();
      const row = await ctx.prisma.teamMember.create({
        data: {
          owner_id: ctx.userId,
          email,
          label: cleanLabel(input.name) || email,
          token_hash: await hashToken(token),
          expires_at: nowSeconds() + INVITE_DAYS * 86_400,
          clients: { create: ids.map((client_id) => ({ client_id })) },
        },
      });
      const mail = await sendTo(ctx, email, token);
      return { id: row.id, token, ...mail };
    }),

  /** Makes a fresh link for someone who has not accepted yet (the old link stops working) and emails it again. */
  resend: protectedProcedure.input(z.object({ id: z.string().max(100) })).mutation(async ({ ctx, input }) => {
    const token = newToken();
    const done = await ctx.prisma.teamMember.updateMany({
      where: { id: input.id, owner_id: ctx.userId, member_id: null, revoked_at: null },
      data: { token_hash: await hashToken(token), expires_at: nowSeconds() + INVITE_DAYS * 86_400 },
    });
    if (done.count !== 1)
      throw new TRPCError({ code: "NOT_FOUND", message: "That invitation isn't waiting any more." });
    const row = await ctx.prisma.teamMember.findFirst({
      where: { id: input.id, owner_id: ctx.userId },
      select: { email: true },
    });
    const mail = await sendTo(ctx, row?.email ?? "", token);
    return { id: input.id, token, ...mail };
  }),

  /** Replaces the clients a person may log time on. Only for someone not removed, and only the owner's own clients. */
  setClients: protectedProcedure
    .input(z.object({ id: z.string().max(100), clientIds }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.prisma.teamMember.findFirst({
        where: { id: input.id, owner_id: ctx.userId, revoked_at: null },
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Person not found." });
      const ids = [...new Set(input.clientIds)];
      const owned = await ctx.prisma.client.count({ where: { user_id: ctx.userId, id: { in: ids } } });
      if (owned !== ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
      await ctx.prisma.teamMemberClient.deleteMany({ where: { team_member_id: member.id } });
      await ctx.prisma.teamMemberClient.createMany({
        data: ids.map((client_id) => ({ team_member_id: member.id, client_id })),
      });
      return { id: member.id, clientIds: ids };
    }),

  /** Removes a person (or cancels an invitation). Their entries stay on the owner's books. Removing twice is harmless. */
  remove: protectedProcedure.input(z.object({ id: z.string().max(100) })).mutation(async ({ ctx, input }) => {
    const done = await ctx.prisma.teamMember.updateMany({
      where: { id: input.id, owner_id: ctx.userId, revoked_at: null },
      data: { revoked_at: nowSeconds(), token_hash: null, expires_at: null },
    });
    return { removed: done.count };
  }),
});
