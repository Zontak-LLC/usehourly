import { TRPCError } from "@trpc/server";

import { logWarn } from "@/lib/log";

/** What a visitor reads when the database is over capacity for a moment. */
export const D1_BUSY_MESSAGE = "UseHourly is busy right now. Please try again in a few seconds.";

const OVERLOADED_TEXT = "D1 DB is overloaded";
const CAUSE_DEPTH = 3;
const MAX_LOGGED = 300;

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "";
}

/**
 * Whether D1 refused a statement because it is over capacity (error text or one of its causes, up to 3 levels).
 * Returns false for every other error. Never throws.
 */
export function isD1Overloaded(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth <= CAUSE_DEPTH && current !== undefined && current !== null; depth++) {
    if (messageOf(current).includes(OVERLOADED_TEXT)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Turns a D1 overload into a calm 503 and one warning line (`where` names the call site); never retries.
 * Any other error is rethrown unchanged.
 * @throws TRPCError SERVICE_UNAVAILABLE when D1 is overloaded, otherwise `err` itself.
 */
export function rethrowIfD1Busy(err: unknown, where: string): never {
  if (!isD1Overloaded(err)) throw err;
  logWarn("d1_overloaded", { where, message: messageOf(err).slice(0, MAX_LOGGED) });
  throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: D1_BUSY_MESSAGE });
}
