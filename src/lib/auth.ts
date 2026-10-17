import { headers } from "next/headers";

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { z } from "zod";

import { normalizeEmail } from "@/lib/email";
import type { GithubEmail } from "@/lib/github-login";
import { passwordMatches } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";
import { clearRateLimit, hitRateLimit, LOGIN_PER_EMAIL, LOGIN_PER_IP } from "@/lib/rate-limit";
import { createDemoUser } from "@/server/demo";
import { resolveGithubUser } from "@/server/github-signin";

import authConfig from "./auth.config";

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

/** "Sign in with GitHub" is offered only when the GitHub OAuth app's id and secret are set. */
export const githubLoginEnabled = () => Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);

async function githubEmails(accessToken: string): Promise<GithubEmail[]> {
  const res = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "usehourly",
    },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} when listing email addresses`);
  const list = (await res.json()) as GithubEmail[];
  return Array.isArray(list) ? list : [];
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // GitHub sign-in: find, link or create the UseHourly account, then hand its id to the session token.
    async signIn({ user, account, profile }) {
      if (account?.provider !== "github") return true;
      try {
        if (!account.access_token || profile?.id === undefined) return "/auth/v2/login?error=github";
        const ip = (await headers()).get("cf-connecting-ip");
        const result = await resolveGithubUser(await getPrisma(), {
          githubId: String(profile.id),
          emails: await githubEmails(account.access_token),
          name: typeof profile.name === "string" ? profile.name : null,
          login: typeof profile.login === "string" ? profile.login : null,
          ip,
        });
        if (!result.ok) {
          const why = result.reason === "rate-limited" ? "limit" : result.reason;
          return `/auth/v2/login?error=github&why=${why}`;
        }
        user.id = result.user.id;
        user.name = result.user.name;
        user.email = result.user.email;
        user.tv = result.user.token_version;
        return true;
      } catch (err) {
        console.error("GitHub sign-in failed:", err);
        return "/auth/v2/login?error=github";
      }
    },
  },
  providers: [
    ...(githubLoginEnabled() ? [GitHub({ authorization: { params: { scope: "read:user user:email" } } })] : []),
    // "Try the demo": makes a throwaway account with sample data and signs the visitor in. No password.
    Credentials({
      id: "demo",
      name: "Demo",
      credentials: {},
      async authorize(_credentials, request) {
        try {
          const made = await createDemoUser(await getPrisma(), { ip: request?.headers?.get("cf-connecting-ip") });
          if (!made.ok) return null;
          const { id, name, email, token_version } = made.user;
          return { id, name, email, tv: token_version, demo: true };
        } catch (err) {
          console.error("demo sign-in failed:", err);
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

        // Throttle guessing: per address and per connection. A throttled attempt is simply refused,
        // the same as a wrong password, so it reveals nothing about the account.
        const ip = request?.headers?.get("cf-connecting-ip");
        const emailKey = `login:email:${email}`;
        const byEmail = await hitRateLimit(prisma, emailKey, LOGIN_PER_EMAIL.limit, LOGIN_PER_EMAIL.windowSeconds);
        if (!byEmail.allowed) return null;
        if (ip) {
          const byIp = await hitRateLimit(prisma, `login:ip:${ip}`, LOGIN_PER_IP.limit, LOGIN_PER_IP.windowSeconds);
          if (!byIp.allowed) return null;
        }

        const user = await prisma.authUser.findUnique({ where: { email } });
        if (!user || !(await passwordMatches(parsed.data.password, user.password_hash))) {
          if (!user) await passwordMatches(parsed.data.password, null); // same cost as a wrong password
          return null;
        }
        await clearRateLimit(prisma, emailKey);
        return { id: user.id, name: user.name, email: user.email, tv: user.token_version };
      },
    }),
  ],
});
