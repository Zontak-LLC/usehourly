import type { PrismaClient } from "@prisma/client";

import {
  DRILL_KEY,
  type Drill,
  type DrillEnv,
  type DrillFault,
  drillArmed,
  drillRunning,
  newDrill,
  parseDrill,
} from "@/lib/drill";
import { logError, logWarn } from "@/lib/log";

type Db = Pick<PrismaClient, "appSetting">;

/**
 * NEXT_PUBLIC_* values are baked in at build time, so they are read by their literal names here: the production build
 * never has NEXT_PUBLIC_APP_ENV = "staging", so on production `drillArmed` is false before any secret is looked at.
 */
export const drillEnv = (): DrillEnv => ({
  appEnv: process.env.NEXT_PUBLIC_APP_ENV,
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  token: process.env.DRILL_TOKEN,
});

/** Each Worker isolate keeps what it read for a few seconds, so a busy path costs at most one read every 5 seconds. */
const CACHE_MS = 5000;
let cache: { at: number; drill: Drill | null } | null = null;

/** For tests, and after this isolate changes the drill itself. */
export function forgetDrillCache(drill?: Drill | null, now = Date.now()) {
  cache = drill === undefined ? null : { at: now, drill };
}

/** The running drill, or null. An expired one is removed and logged once (the conditional delete decides who logs). */
export async function readDrill(prisma: Db, now = Date.now()): Promise<Drill | null> {
  if (cache && now - cache.at < CACHE_MS) return drillRunning(cache.drill, now) ? cache.drill : null;
  const row = await prisma.appSetting.findUnique({ where: { key: DRILL_KEY }, select: { value: true } });
  const drill = parseDrill(row?.value);
  if (row && !drillRunning(drill, now)) {
    const gone = await prisma.appSetting.deleteMany({ where: { key: DRILL_KEY, value: row.value } });
    if (gone.count > 0 && drill)
      logWarn("drill_expired", { fault: drill.fault, expired: new Date(drill.until).toISOString() });
    cache = { at: now, drill: null };
    return null;
  }
  cache = { at: now, drill };
  return drill;
}

/**
 * Whether this fault is running now. Off staging (or with no token) this returns false WITHOUT touching the database,
 * so production pays nothing for the switch. A failed read never breaks the path: no drill.
 */
export async function faultActive(prisma: Db, fault: DrillFault, env = drillEnv(), now = Date.now()) {
  if (!drillArmed(env)) return false;
  try {
    return (await readDrill(prisma, now))?.fault === fault;
  } catch (err) {
    logError("drill_read_failed", err);
    return false;
  }
}

export async function startDrill(prisma: Db, fault: DrillFault, minutes: number, now = Date.now()): Promise<Drill> {
  const drill = newDrill(fault, minutes, now);
  const value = JSON.stringify(drill);
  await prisma.appSetting.upsert({ where: { key: DRILL_KEY }, create: { key: DRILL_KEY, value }, update: { value } });
  forgetDrillCache(drill, now);
  logWarn("drill_started", { fault, expires: new Date(drill.until).toISOString(), minutes });
  return drill;
}

export async function stopDrill(prisma: Db, now = Date.now()): Promise<Drill | null> {
  forgetDrillCache();
  const drill = await readDrill(prisma, now).catch(() => null);
  await prisma.appSetting.deleteMany({ where: { key: DRILL_KEY } });
  forgetDrillCache(null, now);
  logWarn("drill_stopped", { fault: drill?.fault ?? null });
  return drill;
}

/** The error a drilled path throws: it reads like the real failure, and says it is a drill. */
export const drillError = (what: string) => new Error(`D1_ERROR: ${what} (drill: a planned test failure on staging)`);
