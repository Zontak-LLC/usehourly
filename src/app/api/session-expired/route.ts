import { signOut } from "@/lib/auth";

/**
 * Where the dashboard sends a signed-in browser whose token is no longer valid. A route handler can
 * clear the session cookie (a page cannot); without this the login page would bounce the stale
 * cookie straight back to the dashboard.
 */
export async function GET() {
  await signOut({ redirectTo: "/auth/v2/login" });
}
