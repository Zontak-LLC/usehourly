/**
 * Who may see which page. Kept as a pure function so the rule can be tested without the
 * auth middleware: `src/proxy.ts` just asks it and acts on the answer.
 *
 * - `/` is the public landing page. Visitors see it; someone already signed in goes straight
 *   to their day, so returning users never see the sales page.
 * - `/auth/*` are the log-in and create-account pages: public, but pointless once signed in.
 * - everything else needs a signed-in user.
 */
export type AccessDecision = "allow" | "to-login" | "to-dashboard";

export const LOGIN_PATH = "/auth/v2/login";
export const DASHBOARD_PATH = "/dashboard/today";

export function accessDecision(pathname: string, signedIn: boolean): AccessDecision {
  const isLanding = pathname === "/";
  const isAuthPage = pathname === "/auth" || pathname.startsWith("/auth/");
  if (signedIn) {
    return isLanding || isAuthPage ? "to-dashboard" : "allow";
  }
  return isLanding || isAuthPage ? "allow" : "to-login";
}
