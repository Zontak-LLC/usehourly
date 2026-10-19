/**
 * Who may see which page. Kept as a pure function so the rule can be tested without the
 * auth middleware: `src/proxy.ts` just asks it and acts on the answer.
 *
 * - `/` is the public landing page. Visitors see it; someone already signed in goes straight
 *   to their day, so returning users never see the sales page.
 * - `/auth/*` are the log-in and create-account pages: public, but pointless once signed in.
 * - `/privacy`, `/terms`, `/reset-password`, `/verify-email`, `/reminders/off`, the app manifest and the offline worker (`/sw.js`, `/offline.html`) are public for everyone, signed in or not.
 * - `/timesheet/<token>` is a private link a freelancer sends a client for sign-off: public for everyone, protected by the unguessable token.
 * - `/invoice/<token>` is a private link a freelancer sends a client to view an invoice: public for everyone, protected by the unguessable token.
 * - `/team/join/<token>` is the page a team invitation opens: public so it can send a signed-out visitor to log in and bring them back; the link is claimed only by the signed-in person's button.
 * - `/.well-known/*` is public (the MCP registry reads its domain-verification file there).
 * - everything else needs a signed-in user.
 */
export type AccessDecision = "allow" | "to-login" | "to-dashboard";

export const LOGIN_PATH = "/auth/v2/login";
export const DASHBOARD_PATH = "/dashboard/today";

/** Pages anyone may open, signed in or not: legal pages and the emailed-link pages. */
const PUBLIC_FOR_EVERYONE = new Set([
  "/privacy",
  "/terms",
  "/reset-password",
  "/verify-email",
  "/reminders/off",
  "/stop-emails",
  "/oauth/authorize",
  "/tools/hours-calculator",
  "/manifest.webmanifest",
  // The offline service worker and its fallback page: the browser fetches them before anyone is signed in.
  "/sw.js",
  "/offline.html",
]);

export function accessDecision(pathname: string, signedIn: boolean): AccessDecision {
  if (
    PUBLIC_FOR_EVERYONE.has(pathname) ||
    pathname.startsWith("/.well-known/") ||
    pathname.startsWith("/timesheet/") ||
    pathname.startsWith("/invoice/") ||
    pathname.startsWith("/team/join/")
  ) {
    return "allow";
  }
  const isLanding = pathname === "/";
  const isAuthPage = pathname === "/auth" || pathname.startsWith("/auth/");
  if (signedIn) {
    return isLanding || isAuthPage ? "to-dashboard" : "allow";
  }
  return isLanding || isAuthPage ? "allow" : "to-login";
}
