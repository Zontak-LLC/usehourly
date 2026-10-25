import { type DrillEnv, drillArmed, sameSecret } from "@/lib/drill";

/**
 * The swarm pass (staging only): lets the Performance Check (`npm run perf-check`, docs/specs/performance-check.md)
 * drive many test accounts from one machine without tripping the per-account tRPC write limit or the login throttle.
 * Nothing else changes: every other limit, every check and every owner filter still applies.
 *
 * A request gets the pass only when ALL of these hold: the same gate as the drill switch (`drillArmed`: the staging
 * build, not usehourly.app, a token of 32+ characters, here SWARM_TOKEN), the account is a stress-test account
 * (an address ending @stress.invalid, a reserved domain nobody can own), and the request carries the right token in
 * the `x-swarm-token` header (constant-time compare). On production `drillArmed` is false before anything is read.
 */
export const SWARM_HEADER = "x-swarm-token";
export const STRESS_DOMAIN = "@stress.invalid";

export type SwarmEnv = DrillEnv;

/** NEXT_PUBLIC_* values are baked in at build time, so they are read by their literal names (see server/drill.ts). */
export const swarmEnv = (): SwarmEnv => ({
  appEnv: process.env.NEXT_PUBLIC_APP_ENV,
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  token: process.env.SWARM_TOKEN,
});

/** A stress-test account: stress-NNNNN@stress.invalid (scripts/stress/seed.mjs). Anything else never gets the pass. */
export function isStressEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e.length > STRESS_DOMAIN.length && e.endsWith(STRESS_DOMAIN) && e.indexOf("@") === e.lastIndexOf("@");
}

/** Whether this request, made for the account with this address, may skip the write limit and the login throttle. */
export async function swarmPass(
  headers: Headers | null | undefined,
  email: string | null | undefined,
  env: SwarmEnv = swarmEnv(),
): Promise<boolean> {
  if (!drillArmed(env) || !env.token) return false;
  if (!isStressEmail(email)) return false;
  const given = headers?.get(SWARM_HEADER)?.trim();
  if (!given) return false;
  return sameSecret(given, env.token);
}
