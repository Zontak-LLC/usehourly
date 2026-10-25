import { TRPCError } from "@trpc/server";

import { formatCount } from "@/lib/money";

/**
 * How much one account may store. Registration is open and free, so without a ceiling one account
 * could fill the shared database. The numbers are far above real use (a busy freelancer logs a few
 * thousand entries a year) and are checked where rows are created.
 */
export const QUOTAS = {
  clients: 200,
  projects: 500,
  entries: 50_000,
  invoices: 2_000,
  nonBillableDays: 3_650,
  expenses: 10_000,
} as const;

/** A demo account is a sandbox, so it gets a much smaller allowance. */
export const DEMO_QUOTAS = {
  clients: 6,
  projects: 12,
  entries: 600,
  invoices: 6,
  nonBillableDays: 60,
  expenses: 100,
} as const;

export type QuotaKind = keyof typeof QUOTAS;

/** The most rows of `kind` one account may hold. */
export function quotaLimit(kind: QuotaKind, demo = false): number {
  return (demo ? DEMO_QUOTAS : QUOTAS)[kind];
}

/** The plain-words error a person sees at the limit for `kind` (the one place its wording lives). */
export function quotaError(kind: QuotaKind, demo = false): TRPCError {
  const limit = formatCount(quotaLimit(kind, demo));
  return new TRPCError({
    code: "FORBIDDEN",
    message: demo
      ? `The demo is limited to ${limit} ${kind}. Create a free account to add more.`
      : `You've reached the limit of ${limit} ${kind}. Please write to the site owner if you need more.`,
  });
}

/** Throws a plain-words error when `current + adding` would pass the limit for `kind`. */
export function assertWithinQuota(current: number, adding: number, kind: QuotaKind, demo = false): void {
  if (current + adding > quotaLimit(kind, demo)) throw quotaError(kind, demo);
}
