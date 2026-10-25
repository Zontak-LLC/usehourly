import { HEALTH_SLOW_MS } from "@/lib/drill";
import { logError } from "@/lib/log";
import { getPrisma } from "@/lib/prisma";
import { withTimeout } from "@/lib/time-limit";
import { drillError, faultActive } from "@/server/drill";

export const dynamic = "force-dynamic";

/**
 * The probe reads the covering index `(user_id, date, project_id, minutes)` the way Week and Month do, for an id
 * no account can have (account ids are cuids, which never hold a hyphen), so it touches no one's data. Only its
 * time is reported, never its result.
 */
const HEALTH_PROBE_USER = "health-probe";

/**
 * How long each step may wait on the database: opening the client plus the drill reads, then the two timed queries.
 * The drill's own sleep sits between them, outside both. A stalled D1 once held every check for 25-90 s (2026-10-25);
 * now the worst case is 5 s, under Night Watch's 10 s. Guarded by `hang-guard-journey.test.ts`.
 */
const OPEN_MS = 2000;
const QUERY_MS = 3000;

/** Whole milliseconds from `start` to now (Workers advance the clock only after I/O, which is what we time). */
const since = (start: number) => Math.round(performance.now() - start);

/**
 * For an uptime monitor: 200 when the app can reach its database, 503 when it cannot. With 200 it also says how
 * long the database took: `selectMs` for `SELECT 1`, `probeMs` for one realistic indexed read. It reveals nothing
 * else (no counts, no versions, no error text) and needs no sign-in.
 */
async function check() {
  let db: { selectMs: number; probeMs: number } | null = null;
  let drilled = false;
  try {
    const { prisma, slow } = await withTimeout(
      (async () => {
        const client = await getPrisma();
        // Staging drills only (lib/drill.ts); on production these return false without a database read.
        if (await faultActive(client, "health-503")) {
          drilled = true;
          throw drillError("database unavailable");
        }
        return { prisma: client, slow: await faultActive(client, "health-slow") };
      })(),
      OPEN_MS,
      "health database open",
    );
    if (slow) await new Promise((r) => setTimeout(r, HEALTH_SLOW_MS));
    db = await withTimeout(
      (async () => {
        let start = performance.now();
        await prisma.$queryRaw`SELECT 1`;
        const selectMs = since(start);
        start = performance.now();
        await prisma.$queryRaw`SELECT COUNT(*) AS n, COALESCE(SUM(minutes), 0) AS m FROM time_entries WHERE user_id = ${HEALTH_PROBE_USER} AND date BETWEEN '2026-01-01' AND '2026-12-31'`;
        return { selectMs, probeMs: since(start) };
      })(),
      QUERY_MS,
      "health queries",
    );
  } catch (err) {
    logError("health_check_failed", err);
  }
  const body = db ? { ok: true, db } : { ok: false };
  // A drilled 503 says so in a header (the body stays `{ok:false}`), so triage can tell it from a real outage.
  const headers = { "Cache-Control": "no-store", ...(drilled ? { "X-Drill": "health-503" } : {}) };
  return Response.json(body, { status: db ? 200 : 503, headers });
}

export const GET = check;
export const HEAD = check;
