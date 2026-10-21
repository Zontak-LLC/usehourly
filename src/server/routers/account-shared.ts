import { isDemoEmail } from "@/lib/demo";
import { hashToken, newToken, RESET_TTL_SECONDS, VERIFY_TTL_SECONDS } from "@/lib/email-token";
import { resetPasswordMessage, verifyEmailMessage } from "@/lib/mailer";

import type { Context } from "../trpc";

export const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Create a one-time token for the user, replacing any unused one of the same kind, and email it. */
export async function issueEmailToken(
  ctx: Pick<Context, "prisma" | "mailer" | "baseUrl">,
  user: { id: string; email: string },
  kind: "verify" | "reset",
) {
  const mailer = ctx.mailer;
  if (!mailer || isDemoEmail(user.email)) return false; // demo addresses are not real mailboxes
  const token = newToken();
  await ctx.prisma.emailToken.deleteMany({ where: { user_id: user.id, kind, used_at: null } });
  await ctx.prisma.emailToken.create({
    data: {
      user_id: user.id,
      kind,
      token_hash: await hashToken(token),
      expires_at: nowSeconds() + (kind === "reset" ? RESET_TTL_SECONDS : VERIFY_TTL_SECONDS),
    },
  });
  const base = ctx.baseUrl ?? "";
  const link =
    kind === "reset"
      ? `${base}/reset-password?token=${encodeURIComponent(token)}`
      : `${base}/verify-email?token=${encodeURIComponent(token)}`;
  await mailer.send(kind === "reset" ? resetPasswordMessage(user.email, link) : verifyEmailMessage(user.email, link));
  return true;
}

/**
 * Uses a link up: returns its row only to the ONE caller that marks it used. The mark is a single conditional update
 * (still unused, still unexpired), so two requests opening the same link at the same moment cannot both succeed; a
 * read followed by a separate write would let both through.
 */
export async function claimLiveToken(ctx: Pick<Context, "prisma">, token: string, kind: "verify" | "reset") {
  const row = await ctx.prisma.emailToken.findUnique({ where: { token_hash: await hashToken(token) } });
  if (!row || row.kind !== kind) return null;
  const now = nowSeconds();
  const claimed = await ctx.prisma.emailToken.updateMany({
    where: { id: row.id, used_at: null, expires_at: { gt: now } },
    data: { used_at: now },
  });
  return claimed.count === 1 ? row : null;
}

export const LINK_PROBLEM = "This link has expired or was already used. Please request a new one.";
