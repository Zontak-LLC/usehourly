import { TRPCError } from "@trpc/server";

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
} as const;

/** A demo account is a sandbox, so it gets a much smaller allowance. */
export const DEMO_QUOTAS = { clients: 6, projects: 12, entries: 600, invoices: 6, nonBillableDays: 60 } as const;

export type QuotaKind = keyof typeof QUOTAS;

/** Throws a plain-words error when `current + adding` would pass the limit for `kind`. */
export function assertWithinQuota(current: number, adding: number, kind: QuotaKind, demo = false): void {
  const limit = (demo ? DEMO_QUOTAS : QUOTAS)[kind];
  if (current + adding > limit) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: demo
        ? `The demo is limited to ${limit.toLocaleString("en-US")} ${kind}. Create a free account to add more.`
        : `You've reached the limit of ${limit.toLocaleString("en-US")} ${kind}. Please write to the site owner if you need more.`,
    });
  }
}
