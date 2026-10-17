import type { PrismaClient } from "@prisma/client";

import {
  decideGithubSignIn,
  displayNameFor,
  type GithubEmail,
  NO_PASSWORD_HASH,
  pickVerifiedEmail,
} from "@/lib/github-login";
import { hitRateLimit, REGISTER_PER_IP } from "@/lib/rate-limit";

export type GithubSignInResult =
  | { ok: true; user: { id: string; name: string | null; email: string; token_version: number }; created: boolean }
  | { ok: false; reason: "other-github" | "no-verified-email" | "rate-limited" };

/**
 * Finds, links or creates the UseHourly account for a GitHub sign-in (see lib/github-login.ts for the
 * rules). `emails` is GitHub's own list for the signed-in person, fetched with their access token.
 */
export async function resolveGithubUser(
  prisma: PrismaClient,
  input: {
    githubId: string;
    emails: readonly GithubEmail[];
    name?: string | null;
    login?: string | null;
    ip?: string | null;
  },
): Promise<GithubSignInResult> {
  const select = {
    id: true,
    name: true,
    email: true,
    token_version: true,
    github_id: true,
    email_verified_at: true,
    is_demo: true,
  };
  const verifiedEmail = pickVerifiedEmail(input.emails);
  const byGithubId = await prisma.authUser.findUnique({ where: { github_id: input.githubId }, select });
  const byEmail = verifiedEmail ? await prisma.authUser.findUnique({ where: { email: verifiedEmail }, select }) : null;
  const decision = decideGithubSignIn({ githubId: input.githubId, verifiedEmail, byGithubId, byEmail });

  switch (decision.action) {
    case "refuse":
      return { ok: false, reason: decision.reason };
    case "sign-in":
      return { ok: true, user: byGithubId as NonNullable<typeof byGithubId>, created: false };
    case "link": {
      const user = await prisma.authUser.update({
        where: { id: decision.userId },
        data: { github_id: input.githubId },
        select,
      });
      return { ok: true, user, created: false };
    }
    case "take-over": {
      const user = await prisma.authUser.update({
        where: { id: decision.userId },
        data: {
          github_id: input.githubId,
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
          github_id: input.githubId,
          email_verified_at: new Date(),
        },
        select,
      });
      return { ok: true, user, created: true };
    }
  }
}
