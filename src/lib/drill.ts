import { z } from "zod";

/**
 * The drill switch (staging only): break ONE thing on purpose for a few minutes, so Night Watch can be seen to notice
 * a real failure and triage it, then undo it at once. It is a closed list of faults, each touching one path only, and
 * never auth, account deletion, money or anyone's data.
 *
 * It can be armed only when ALL of these hold (see `drillArmed`): the build is the staging build
 * (NEXT_PUBLIC_APP_ENV = "staging", baked in by `npm run staging:deploy` only), the app's address is not the production
 * one, and the DRILL_TOKEN secret is set and long enough. Otherwise /api/drill answers 404 and no fault can run.
 * The running drill lives in `app_settings` (key `drill`) so every Worker isolate sees it; it always expires.
 */
export const DRILL_KEY = "drill";
export const DEFAULT_DRILL_MINUTES = 10;
export const MAX_DRILL_MINUTES = 15;
export const MIN_TOKEN_LENGTH = 32;
const PRODUCTION_HOST = "usehourly.app";

export const DRILL_FAULTS = {
  /** /api/health answers 503 and logs `health_check_failed`, exactly as when the database is down. */
  "health-503": "The health check answers 503 and logs health_check_failed (as if the database were down).",
  /** /api/health takes 6 seconds (Night Watch calls an answer over 5 seconds slow). */
  "health-slow": "The health check answers after 6 seconds (slow, not down).",
  /** entry.list throws, so Today, Week and Month cannot load entries and tRPC logs trpc_internal_error. */
  "entry-list-500": "Loading entries (entry.list) fails with a server error and logs trpc_internal_error.",
} as const;
export type DrillFault = keyof typeof DRILL_FAULTS;
export const FAULT_NAMES = Object.keys(DRILL_FAULTS) as DrillFault[];

export const HEALTH_SLOW_MS = 6000;

export type DrillEnv = { appEnv?: string; appUrl?: string; token?: string };

/** True only on the staging build, away from the production address, with a real token set. */
export function drillArmed(env: DrillEnv): boolean {
  if (env.appEnv !== "staging") return false;
  if (!env.token || env.token.length < MIN_TOKEN_LENGTH) return false;
  let host: string;
  try {
    host = new URL(env.appUrl ?? "").hostname;
  } catch {
    return false;
  }
  return host !== PRODUCTION_HOST && host !== `www.${PRODUCTION_HOST}`;
}

const stored = z.object({
  fault: z.enum(FAULT_NAMES as [DrillFault, ...DrillFault[]]),
  until: z.number().int().positive(),
  started: z.number().int().positive(),
});
export type Drill = z.infer<typeof stored>;

/** The saved drill, or null when there is none or the value is damaged (a bad value must never break anything). */
export function parseDrill(raw: string | null | undefined): Drill | null {
  if (!raw) return null;
  try {
    const parsed = stored.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const drillRunning = (drill: Drill | null, now: number): boolean => !!drill && now < drill.until;

/** What a caller may send to /api/drill. */
export const drillRequest = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    fault: z.enum(FAULT_NAMES as [DrillFault, ...DrillFault[]]),
    minutes: z.number().int().min(1).max(MAX_DRILL_MINUTES).default(DEFAULT_DRILL_MINUTES),
  }),
  z.object({ action: z.literal("stop") }),
]);

export const newDrill = (fault: DrillFault, minutes: number, now: number): Drill => ({
  fault,
  started: now,
  until: now + Math.min(Math.max(1, minutes), MAX_DRILL_MINUTES) * 60_000,
});

/** The bearer token from an Authorization header, or null. */
export function bearer(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? "");
  return m?.[1] ?? null;
}

/**
 * Compares two secrets in constant time: both are hashed first, so neither the content nor the length of the right
 * token can be learned from how long a wrong guess takes.
 */
export async function sameSecret(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
