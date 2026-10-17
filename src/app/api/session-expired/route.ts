import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { sessionStillValid } from "@/lib/session-version";

/**
 * Where the dashboard sends a signed-in browser whose token is no longer valid. A route handler can
 * clear the session cookie (a page cannot); without this the login page would bounce the stale
 * cookie straight back to the dashboard.
 *
 * It only signs out a session that really is stale. A GET can be triggered by any web page (an image
 * tag is enough), so a healthy session is sent on to the app instead of being ended.
 */
export async function GET() {
  const session = await auth();
  if (session?.user?.id) {
    const row = await (await getPrisma()).authUser.findUnique({
      where: { id: session.user.id },
      select: { token_version: true },
    });
    if (sessionStillValid(session.user.tv, row?.token_version)) redirect("/dashboard/today");
  }
  await signOut({ redirectTo: "/auth/v2/login" });
}
