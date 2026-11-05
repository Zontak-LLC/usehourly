import { z } from "zod";

import { MAX_NOTICE_COST, type SupportNotice } from "@/lib/support-notice";

/** What the owner may save: a whole number of US dollars a month. */
export const supportNoticeInput = z.object({ on: z.boolean(), cost: z.number().int().min(1).max(MAX_NOTICE_COST) });

/** The saved notice, or null when it is off, missing or damaged (a bad value must never show a notice). */
export function parseSupportNotice(raw: string | null | undefined): SupportNotice | null {
  if (!raw) return null;
  try {
    const parsed = supportNoticeInput.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.on ? parsed.data : null;
  } catch {
    return null;
  }
}
