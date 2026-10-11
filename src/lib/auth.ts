import { compare } from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { normalizeEmail } from "@/lib/email";
import { getPrisma } from "@/lib/prisma";

import authConfig from "./auth.config";

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await (await getPrisma()).authUser.findUnique({
          where: { email: normalizeEmail(parsed.data.email) },
        });
        if (!user) return null;
        if (!(await compare(parsed.data.password, user.password_hash))) return null;
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
});
