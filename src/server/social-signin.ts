import type { PrismaClient } from "@prisma/client";

import { hitRateLimit, REGISTER_PER_IP } from "@/lib/rate-limit";
import {
  decideSocialSignIn,
  displayNameFor,
  type Known,
  NO_PASSWORD_HASH,
  PROVIDER_COLUMN,
  pickVerifiedEmail,
  type SocialProvider,
  type VerifiedEmail,
} from "@/lib/social-login";

export type SocialSignInResult =
  | { ok: true; user: { id: string; name: string | null; email: string; token_version: number }; created: boolean }
  | { ok: false; reason: "other-account" | "no-verified-email" | "rate-limited" };

const select = {
  id: true,
  name: true,
  email: true,
  token_version: true,
  github_id: true,
  google_id: true,
  email_verified_at: true,
  is_demo: true,
} as const;

/**
 * Finds, links or creates the UseHourly account for a GitHub or Google sign-in (rules in
 * lib/social-login.ts). `emails` is the provider's own statement of which addresses the person has
 * and whether each is verified.
 */
export async function resolveSocialUser(
  prisma: PrismaClient,
  input: {
    provider: SocialProvider;
    providerId: string;
    emails: readonly VerifiedEmail[];
    name?: string | null;
    login?: string | null;
    ip?: string | null;
  },
): Promise<SocialSignInResult> {
  const column = PROVIDER_COLUMN[input.provider];
  const verifiedEmail = pickVerifiedEmail(input.emails);
  const toKnown = (
    u: { id: string; email_verified_at: Date | null; is_demo: boolean } & Record<string, unknown>,
  ): Known => ({
    id: u.id,
    email_verified_at: u.email_verified_at,
    is_demo: u.is_demo,
    linkedId: (u[column] as string | null) ?? null,
  });

  const byProviderRow = await prisma.authUser.findUnique({ where: { [column]: input.providerId } as never, select });
  const byEmailRow = verifiedEmail
    ? await prisma.authUser.findUnique({ where: { email: verifiedEmail }, select })
    : null;
  const decision = decideSocialSignIn({
    providerId: input.providerId,
    verifiedEmail,
    byProviderId: byProviderRow ? toKnown(byProviderRow) : null,
    byEmail: byEmailRow ? toKnown(byEmailRow) : null,
  });

  switch (decision.action) {
    case "refuse":
      return { ok: false, reason: decision.reason };
    case "sign-in":
      return { ok: true, user: byProviderRow as NonNullable<typeof byProviderRow>, created: false };
    case "link": {
      const user = await prisma.authUser.update({
        where: { id: decision.userId },
        data: { [column]: input.providerId },
        select,
      });
      return { ok: true, user, created: false };
    }
    case "take-over": {
      const user = await prisma.authUser.update({
        where: { id: decision.userId },
        data: {
          [column]: input.providerId,
          email_verified_at: new Date(),
          password_hash: NO_PASSWORD_HASH,
          token_version: { increment: 1 },
        },
        select,
      });
      return { ok: true, user, created: false };
    }
    case "create": {
      if (input.ip) {
        const r = await hitRateLimit(
          prisma,
          `register:${input.ip}`,
          REGISTER_PER_IP.limit,
          REGISTER_PER_IP.windowSeconds,
        );
        if (!r.allowed) return { ok: false, reason: "rate-limited" };
      }
      const email = verifiedEmail as string;
      const user = await prisma.authUser.create({
        data: {
          name: displayNameFor({ name: input.name, login: input.login }, email),
          email,
          password_hash: NO_PASSWORD_HASH,
          [column]: input.providerId,
          email_verified_at: new Date(),
        },
        select,
      });
      return { ok: true, user, created: true };
    }
  }
}
