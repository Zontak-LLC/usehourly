/**
 * Limits and retry rule for `/api/health` (kept out of the route file: Next route files export only handlers).
 *
 * How long each step may wait on the database: opening the client plus the drill reads, then the two timed queries.
 * A stalled D1 once held every check for 25-90 s (2026-10-25). Guarded by `hang-guard-journey.test.ts`.
 */
export const OPEN_MS = 2000;
export const QUERY_MS = 3000;

/**
 * Staging saw on-and-off 503s from short D1 drops (Sentinel, 2026-11-06), so a quick failure is tried once more after
 * a short wait. Only when the first try failed within `RETRY_MAX_ELAPSED_MS`: with the retry the worst case is
 * 1500 + 250 + 2000 + 3000 = 6750 ms, still under Night Watch's 10 s.
 */
export const RETRY_WAIT_MS = 250;
export const RETRY_MAX_ELAPSED_MS = 1500;

/** The step that was running when the check failed: getPrisma, the drill reads, `SELECT 1`, the indexed probe. */
export type HealthStep = "open" | "drill" | "select" | "probe";

export type HealthFailure = { attempt: number; timedOut: boolean; drilled: boolean; elapsedMs: number };

/** A timeout or a drilled 503 is never tried again, nor a failure that already used up the time for a second try. */
export const shouldRetryHealth = ({ attempt, timedOut, drilled, elapsedMs }: HealthFailure) =>
  attempt === 1 && !timedOut && !drilled && elapsedMs <= RETRY_MAX_ELAPSED_MS;
