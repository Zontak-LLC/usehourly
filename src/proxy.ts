import { NextResponse } from "next/server";

import NextAuth from "next-auth";

import authConfig from "@/lib/auth.config";
import { buildCsp, newNonce } from "@/lib/csp";
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
  // A fresh nonce per request: the policy goes on the response, and on the request too so Next.js puts the nonce on
  // its own inline scripts. The root layout reads `x-nonce` for the theme boot script.
  const nonce = newNonce();
  const isProd = process.env.NODE_ENV === "production";
  const csp = buildCsp(nonce, isProd, isProd && process.env.E2E_SERVE !== "1");
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|webp|svg|txt|xml|ico)$).*)"],
};
