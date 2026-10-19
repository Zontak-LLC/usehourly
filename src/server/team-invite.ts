import type { PrismaClient } from "@prisma/client";

import { normalizeEmail } from "@/lib/email";
import { logError } from "@/lib/log";
import { type Mailer, teamInviteMessage } from "@/lib/mailer";
import { describeWait, hitRateLimit } from "@/lib/rate-limit";
import { stopEmailToken } from "@/lib/reminder-token";
import { sha256Hex } from "@/lib/sha256";
import {
  INVITE_DAYS,
  inviteMailBlocker,
  TEAM_INVITES_PER_ACCOUNT_PER_DAY,
  TEAM_INVITES_PER_RECIPIENT_PER_DAY,
} from "@/lib/team";

export type InviteMailResult = { emailed: true } | { emailed: false; reason: string };

/**
 * Emails an invitation link, after every guard: the sender is confirmed and not new, the address has not opted out,
 * and neither the sender nor the address is over its daily limit. Never throws for "could not send": the invitation
 * already exists, so the answer says why it was not emailed and the owner copies the link instead.
 */
export async function emailInvite(i: {
  prisma: PrismaClient;
  mailer: Mailer | null;
  ownerId: string;
  to: string;
  token: string;
  appUrl: string;
  secret: string;
  now?: Date;
}): Promise<InviteMailResult> {
  const { prisma, mailer, ownerId } = i;
  const to = normalizeEmail(i.to);
  if (!mailer)
    return { emailed: false, reason: "Email isn't set up on this server. Copy the link and send it yourself." };
  const owner = await prisma.authUser.findUnique({
    where: { id: ownerId },
    select: {
      name: true,
      business_name: true,
      email: true,
      email_verified_at: true,
      email_bounced_at: true,
      is_demo: true,
      created_at: true,
    },
  });
  if (!owner) return { emailed: false, reason: "Account not found." };
  const blocked = inviteMailBlocker(owner, i.now ?? new Date());
  if (blocked) return { emailed: false, reason: blocked };
  if (await prisma.emailSuppression.findUnique({ where: { email: to } })) {
    return {
      emailed: false,
      reason: "That address has asked not to get emails from UseHourly. Copy the link and send it yourself.",
    };
  }
  const tooMany = async (key: string, limit: number) => {
    const r = await hitRateLimit(prisma, key, limit, 86_400);
    return r.allowed ? null : describeWait(r.retryAfterSeconds);
  };
  const accountWait = await tooMany(`teaminv:u:${ownerId}`, TEAM_INVITES_PER_ACCOUNT_PER_DAY);
  if (accountWait) {
    return {
      emailed: false,
      reason: `You've emailed ${TEAM_INVITES_PER_ACCOUNT_PER_DAY} invitations today. Try again in ${accountWait}, or copy the link.`,
    };
  }
  const recipientWait = await tooMany(`teaminv:r:${await sha256Hex(to)}`, TEAM_INVITES_PER_RECIPIENT_PER_DAY);
  if (recipientWait) {
    return {
      emailed: false,
      reason: `That address already got ${TEAM_INVITES_PER_RECIPIENT_PER_DAY} emails today. Try again in ${recipientWait}, or copy the link.`,
    };
  }
  const query = `e=${encodeURIComponent(to)}&t=${encodeURIComponent(await stopEmailToken(i.secret, to))}`;
  try {
    await mailer.send(
      teamInviteMessage(to, {
        ownerName: owner.business_name?.trim() || owner.name?.trim() || "",
        ownerEmail: owner.email,
        link: `${i.appUrl}/team/join/${i.token}`,
        stopUrl: `${i.appUrl}/stop-emails?${query}`,
        oneClickUrl: `${i.appUrl}/api/stop-emails?${query}`,
        days: INVITE_DAYS,
      }),
    );
  } catch (err) {
    logError("team_invite_email_failed", err);
    return { emailed: false, reason: "Couldn't send the email right now. Copy the link, or try again in a minute." };
  }
  return { emailed: true };
}
