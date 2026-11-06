import { HEALTH_SLOW_MS } from "@/lib/drill";
import { type HealthStep, OPEN_MS, QUERY_MS, RETRY_WAIT_MS, shouldRetryHealth } from "@/lib/health";
import { describeError, logError, logWarn } from "@/lib/log";
import { getPrisma } from "@/lib/prisma";
import { TimeLimitError, withTimeout } from "@/lib/time-limit";
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Where one try got to: the step running now, and whether a drill failed it on purpose. */
type Progress = { step: HealthStep; drilled: boolean };

/**
 * One try: opening the client plus the drill reads (`OPEN_MS`), the drill's own sleep outside both limits, then
 * `SELECT 1` plus the probe (`QUERY_MS`). `progress` says which step was running when it throws.
 */
async function tryOnce(progress: Progress) {
  const { prisma, slow } = await withTimeout(
    (async () => {
      const client = await getPrisma();
      // Staging drills only (lib/drill.ts); on production these return false without a database read.
      progress.step = "drill";
      if (await faultActive(client, "health-503")) {
        progress.drilled = true;
        throw drillError("database unavailable");
      }
      return { prisma: client, slow: await faultActive(client, "health-slow") };
    })(),
    OPEN_MS,
    "health database open",
  );
  if (slow) await sleep(HEALTH_SLOW_MS);
  return withTimeout(
    (async () => {
      progress.step = "select";
      let start = performance.now();
      await prisma.$queryRaw`SELECT 1`;
      const selectMs = since(start);
      progress.step = "probe";
      start = performance.now();
      await prisma.$queryRaw`SELECT COUNT(*) AS n, COALESCE(SUM(minutes), 0) AS m FROM time_entries WHERE user_id = ${HEALTH_PROBE_USER} AND date BETWEEN '2026-01-01' AND '2026-12-31'`;
      return { selectMs, probeMs: since(start) };
    })(),
    QUERY_MS,
    "health queries",
  );
}

/**
 * For an uptime monitor: 200 when the app can reach its database, 503 when it cannot. With 200 it also says how
 * long the database took: `selectMs` for `SELECT 1`, `probeMs` for one realistic indexed read. It reveals nothing
 * else (no counts, no versions, no error text) and needs no sign-in. A quick failure is tried once more
 * (`shouldRetryHealth` in lib/health.ts), so the worst case is 6.75 s, under Night Watch's 10 s. A failed check logs
 * one `health_check_failed` line: the step, the error and how long the whole check took.
 */
async function check() {
  const checkStart = performance.now();
  let db: { selectMs: number; probeMs: number } | null = null;
  let drilled = false;
  for (let attempt = 1; !db; attempt++) {
    // A fresh object per try: a timed-out try keeps running in the background and must not move the next one's step.
    const progress: Progress = { step: "open", drilled: false };
    try {
      db = await tryOnce(progress);
    } catch (err) {
      const { step } = progress;
      const timedOut = err instanceof TimeLimitError;
      const ms = since(checkStart);
      if (shouldRetryHealth({ attempt, timedOut, drilled: progress.drilled, elapsedMs: ms })) {
        logWarn("health_check_retry", { step, ms, message: describeError(err).message.slice(0, 300) });
        await sleep(RETRY_WAIT_MS);
        continue;
      }
      drilled = progress.drilled;
      logError("health_check_failed", err, { step, ms, attempt, timedOut, drilled });
      break;
    }
  }
  const body = db ? { ok: true, db } : { ok: false };
  // A drilled 503 says so in a header (the body stays `{ok:false}`), so triage can tell it from a real outage.
  const headers = { "Cache-Control": "no-store", ...(drilled ? { "X-Drill": "health-503" } : {}) };
  return Response.json(body, { status: db ? 200 : 503, headers });
}

export const GET = check;
export const HEAD = check;
