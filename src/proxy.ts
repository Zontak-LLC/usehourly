import { NextResponse } from "next/server";

import NextAuth from "next-auth";

import authConfig from "@/lib/auth.config";
import { newNonce } from "@/lib/csp";
import { accessDecision, DASHBOARD_PATH, isStrayFormPost, LOGIN_PATH } from "@/lib/route-access";
import { buildCsp } from "@/lib/security-policy.mjs";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  // Bot form posts with no action id: refuse them before Next's action handler warns (incident
  // usehourly:9bef45d27c59b510). No log line here: one line per bot post is the noise we remove.
  if (isStrayFormPost(req.method, req.headers.get("content-type"), req.headers.get("next-action"))) {
    return new Response("Bad request", { status: 400, headers: { "content-type": "text/plain" } });
  }
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
  const csp = buildCsp({
    scriptSources: [`'nonce-${nonce}'`],
    isProd,
    upgradeToHttps: isProd && process.env.E2E_SERVE !== "1",
  });
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
});

// Static files skip the proxy by name (whole folders, or single files matched exactly), never by file ending, so a page
// address such as `/dashboard/clients/abc.png` still gets the sign-in check and the nonce CSP. The single files are the
// metadata files in `src/app/` that crawlers fetch signed out: a new one there must be named here too. `api(?:/|$)`
// keeps an address that only starts with "api" (such as `/apiary`) a page.
// `.+`, not `.*`: the bare `/` is left out. The landing page is a static file Cloudflare serves before the Worker runs
// (no cold start); it carries its own CSP by hash (scripts/landing-static.mjs) and sends a signed-in visitor on itself.
// The one exception: a request to / with a body (a content-type header) and no action id runs the proxy, so the
// stray-form guard above sees a bot's form post there too. A browser's GET of the landing page has no content-type.
export const config = {
  matcher: [
    "/((?!(?:api(?:/|$)|_next/static/|_next/image|icons/|landing/|examples/|(?:favicon\\.ico|icon\\.svg|apple-icon\\.png|opengraph-image\\.png|twitter-image\\.png|robots\\.txt|sitemap\\.xml)$)).+)",
    { source: "/", has: [{ type: "header", key: "content-type" }], missing: [{ type: "header", key: "next-action" }] },
  ],
};
