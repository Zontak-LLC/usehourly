import type { PrismaClient } from "@prisma/client";

import { LINK_KEEP_AFTER_EXPIRY_DAYS } from "@/lib/invoice-link";
import { SHARE_KEEP_AFTER_EXPIRY_DAYS } from "@/lib/timesheet-share";

export type Housekeeping = {
  rateLimits: number;
  emailTokens: number;
  oauthCodes: number;
  timesheetShares: number;
  invoiceLinks: number;
};

const HOUR = 3600;
const DAY = 24 * HOUR;

/**
 * Sweeps rows that are only useful for a short time and that anyone can create for free: spent
 * throttle counters (a made-up key per request would otherwise pile up for ever), email links that
 * expired a week ago, and authorization codes that expired a day ago. Called by the hourly cron job.
 * Each sweep stands alone, so one failing never stops the others.
 */
export async function runHousekeeping(
  prisma: PrismaClient,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<Housekeeping> {
  const count = async (sweep: () => Promise<{ count: number }>) => {
    try {
      return (await sweep()).count;
    } catch (err) {
      console.error("housekeeping sweep failed:", err);
      return 0;
    }
  };
  return {
    rateLimits: await count(() => prisma.rateLimit.deleteMany({ where: { reset_at: { lt: nowSeconds - HOUR } } })),
    emailTokens: await count(() =>
      prisma.emailToken.deleteMany({ where: { expires_at: { lt: nowSeconds - 7 * DAY } } }),
    ),
    oauthCodes: await count(() => prisma.oauthCode.deleteMany({ where: { expires_at: { lt: nowSeconds - DAY } } })),
    invoiceLinks: await count(() =>
      prisma.invoiceLink.deleteMany({ where: { expires_at: { lt: nowSeconds - LINK_KEEP_AFTER_EXPIRY_DAYS * DAY } } }),
    ),
    // Shared timesheets hold a client's hours, so they are not kept long after they stop working.
    timesheetShares: await count(() =>
      prisma.timesheetShare.deleteMany({
        where: { expires_at: { lt: nowSeconds - SHARE_KEEP_AFTER_EXPIRY_DAYS * DAY } },
      }),
    ),
  };
}
