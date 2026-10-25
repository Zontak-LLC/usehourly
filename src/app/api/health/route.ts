import { HEALTH_SLOW_MS } from "@/lib/drill";
import { logError } from "@/lib/log";
import { getPrisma } from "@/lib/prisma";
import { drillError, faultActive } from "@/server/drill";

export const dynamic = "force-dynamic";

/**
 * For an uptime monitor: 200 when the app can reach its database, 503 when it cannot. It reveals nothing
 * (no counts, no versions, no error text) and needs no sign-in.
 */
async function check() {
  let ok = false;
  try {
    const prisma = await getPrisma();
    // Staging drills only (lib/drill.ts); on production these return false without a database read.
    if (await faultActive(prisma, "health-503")) throw drillError("database unavailable");
    if (await faultActive(prisma, "health-slow")) await new Promise((r) => setTimeout(r, HEALTH_SLOW_MS));
    await prisma.$queryRaw`SELECT 1`;
    ok = true;
  } catch (err) {
    logError("health_check_failed", err);
  }
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

export const GET = check;
export const HEAD = check;
