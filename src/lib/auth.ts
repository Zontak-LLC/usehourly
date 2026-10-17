import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { normalizeEmail } from "@/lib/email";
import { passwordMatches } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";
import { clearRateLimit, hitRateLimit, LOGIN_PER_EMAIL, LOGIN_PER_IP } from "@/lib/rate-limit";
import { createDemoUser } from "@/server/demo";

import authConfig from "./auth.config";

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
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
