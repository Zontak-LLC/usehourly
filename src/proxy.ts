import NextAuth from "next-auth";

import authConfig from "@/lib/auth.config";
import { accessDecision, DASHBOARD_PATH, LOGIN_PATH } from "@/lib/route-access";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const decision = accessDecision(req.nextUrl.pathname, Boolean(req.auth));
  if (decision === "to-login") {
    return Response.redirect(new URL(LOGIN_PATH, req.nextUrl));
  }
  if (decision === "to-dashboard") {
    return Response.redirect(new URL(DASHBOARD_PATH, req.nextUrl));
  }
});

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|webp|svg|txt|xml|ico)).*)"] };
