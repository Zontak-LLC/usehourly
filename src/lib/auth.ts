import { compare } from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { normalizeEmail } from "@/lib/email";
import { getPrisma } from "@/lib/prisma";
import { clearRateLimit, hitRateLimit, LOGIN_PER_EMAIL, LOGIN_PER_IP } from "@/lib/rate-limit";

import authConfig from "./auth.config";

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
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
        if (!user) return null;
        if (!(await compare(parsed.data.password, user.password_hash))) return null;
        await clearRateLimit(prisma, emailKey);
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
});
