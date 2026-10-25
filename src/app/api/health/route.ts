import { HEALTH_SLOW_MS } from "@/lib/drill";
import { logError } from "@/lib/log";
import { getPrisma } from "@/lib/prisma";
import { drillError, faultActive } from "@/server/drill";

export const dynamic = "force-dynamic";

/**
 * The probe reads the covering index `(user_id, date, project_id, minutes)` the way Week and Month do, for an id
 * no account can have (account ids are cuids, which never hold a hyphen), so it touches no one's data. Only its
 * time is reported, never its result.
 */
const HEALTH_PROBE_USER = "health-probe";

/** Whole milliseconds from `start` to now (Workers advance the clock only after I/O, which is what we time). */
const since = (start: number) => Math.round(performance.now() - start);

/**
 * For an uptime monitor: 200 when the app can reach its database, 503 when it cannot. With 200 it also says how
 * long the database took: `selectMs` for `SELECT 1`, `probeMs` for one realistic indexed read. It reveals nothing
 * else (no counts, no versions, no error text) and needs no sign-in.
 */
async function check() {
  let db: { selectMs: number; probeMs: number } | null = null;
  try {
    const prisma = await getPrisma();
    // Staging drills only (lib/drill.ts); on production these return false without a database read.
    if (await faultActive(prisma, "health-503")) throw drillError("database unavailable");
    if (await faultActive(prisma, "health-slow")) await new Promise((r) => setTimeout(r, HEALTH_SLOW_MS));
    let start = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    const selectMs = since(start);
    start = performance.now();
    await prisma.$queryRaw`SELECT COUNT(*) AS n, COALESCE(SUM(minutes), 0) AS m FROM time_entries WHERE user_id = ${HEALTH_PROBE_USER} AND date BETWEEN '2026-01-01' AND '2026-12-31'`;
    db = { selectMs, probeMs: since(start) };
  } catch (err) {
    logError("health_check_failed", err);
  }
  const body = db ? { ok: true, db } : { ok: false };
  return Response.json(body, { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

export const GET = check;
export const HEAD = check;
