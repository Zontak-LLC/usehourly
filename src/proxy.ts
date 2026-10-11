import NextAuth from "next-auth";

import authConfig from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname.startsWith("/auth");
  if (!req.auth && !isAuthPage) {
    return Response.redirect(new URL("/auth/v2/login", req.nextUrl));
  }
  if (req.auth && isAuthPage) {
    return Response.redirect(new URL("/dashboard/today", req.nextUrl));
  }
});

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|txt)).*)"] };
