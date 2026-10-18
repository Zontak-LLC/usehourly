import { headers } from "next/headers";

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { z } from "zod";

import { clientIpFrom } from "@/lib/client-ip";
import { emailField, normalizeEmail } from "@/lib/email";
import { logError } from "@/lib/log";
import { loginAllowed, loginSucceeded } from "@/lib/login-throttle";
import { passwordMatches } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";
import type { VerifiedEmail } from "@/lib/social-login";
import { createDemoUser } from "@/server/demo";
import { resolveSocialUser } from "@/server/social-signin";

import authConfig from "./auth.config";

const loginSchema = z.object({ email: emailField, password: z.string().min(1).max(200) });

/** Each "Continue with ..." button is offered only when that provider's OAuth id and secret are set. */
export const githubLoginEnabled = () => Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
export const googleLoginEnabled = () => Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

async function githubEmails(accessToken: string): Promise<VerifiedEmail[]> {
  const res = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "usehourly",
    },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} when listing email addresses`);
  const list = (await res.json()) as VerifiedEmail[];
  return Array.isArray(list) ? list : [];
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // GitHub or Google sign-in: find, link or create the UseHourly account, then hand its id to the session token.
    async signIn({ user, account, profile }) {
      const provider = account?.provider;
      if (provider !== "github" && provider !== "google") return true;
      try {
        let providerId: string;
        let emails: VerifiedEmail[];
        if (provider === "github") {
          if (!account?.access_token || profile?.id === undefined) return "/auth/v2/login?error=social";
          providerId = String(profile.id);
          emails = await githubEmails(account.access_token);
        } else {
          // Google states in the sign-in itself whether it has verified the address.
          if (!profile?.sub || typeof profile.email !== "string") return "/auth/v2/login?error=social";
          providerId = String(profile.sub);
          emails = [{ email: profile.email, primary: true, verified: profile.email_verified === true }];
        }
        const ip = clientIpFrom(await headers());
        const result = await resolveSocialUser(await getPrisma(), {
          provider,
          providerId,
          emails,
          name: typeof profile?.name === "string" ? profile.name : null,
          login: provider === "github" && typeof profile?.login === "string" ? profile.login : null,
          ip,
        });
        if (!result.ok) {
          const why = result.reason === "rate-limited" ? "limit" : result.reason;
          return `/auth/v2/login?error=social&why=${why}`;
        }
        user.id = result.user.id;
        user.name = result.user.name;
        user.email = result.user.email;
        user.tv = result.user.token_version;
        return true;
      } catch (err) {
        logError("social_sign_in_failed", err, { provider });
        return "/auth/v2/login?error=social";
      }
    },
  },
  providers: [
    ...(githubLoginEnabled() ? [GitHub({ authorization: { params: { scope: "read:user user:email" } } })] : []),
    ...(googleLoginEnabled() ? [Google({ authorization: { params: { scope: "openid email profile" } } })] : []),
    // "Try the demo": makes a throwaway account with sample data and signs the visitor in. No password.
    Credentials({
      id: "demo",
      name: "Demo",
      credentials: {},
      async authorize(_credentials, request) {
        try {
          const made = await createDemoUser(await getPrisma(), { ip: clientIpFrom(request?.headers) });
          if (!made.ok) return null;
          const { id, name, email, token_version } = made.user;
          return { id, name, email, tv: token_version, demo: true };
        } catch (err) {
          logError("demo_sign_in_failed", err);
          return null;
        }
      },
    }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const prisma = await getPrisma();
        const email = normalizeEmail(parsed.data.email);

        // Throttle guessing (see lib/login-throttle.ts); a refused attempt looks like a wrong password.
        const ip = clientIpFrom(request?.headers);
        if (!(await loginAllowed(prisma, email, ip))) return null;

        const user = await prisma.authUser.findUnique({ where: { email } });
        if (!user || !(await passwordMatches(parsed.data.password, user.password_hash))) {
          if (!user) await passwordMatches(parsed.data.password, null); // same cost as a wrong password
          return null;
        }
        await loginSucceeded(prisma, email, ip);
        return { id: user.id, name: user.name, email: user.email, tv: user.token_version };
      },
    }),
  ],
});
