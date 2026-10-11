import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config — no Prisma/bcrypt imports. Used by proxy.ts, which
 * authorises routes from the JWT cookie alone.
 */
export default {
  trustHost: true,
  providers: [],
  pages: { signIn: "/auth/v2/login" },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token?.id) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
