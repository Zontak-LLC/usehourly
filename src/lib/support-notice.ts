import { z } from "zod";

/**
 * The "chip in" notice (owner-controlled). UseHourly is free and costs the owner real money to host, so if the bill ever
 * gets too large the owner can switch a small, dismissible note on Today that says what hosting costs and links to the
 * donation page. It is shown inside the app, never emailed: /privacy promises no marketing email.
 */
export const SUPPORT_NOTICE_KEY = "support_notice";
export const MAX_NOTICE_COST = 10_000;

const stored = z.object({ on: z.boolean(), cost: z.number().int().min(1).max(MAX_NOTICE_COST) });
export type SupportNotice = z.infer<typeof stored>;
/** What the owner may save: a whole number of US dollars a month. */
export const supportNoticeInput = stored;

/** The saved notice, or null when it is off, missing or damaged (a bad value must never show a notice). */
export function parseSupportNotice(raw: string | null | undefined): SupportNotice | null {
  if (!raw) return null;
  try {
    const parsed = stored.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.on ? parsed.data : null;
  } catch {
    return null;
  }
}

export const supportNoticeText = (cost: number) =>
  `UseHourly is free, and I pay for the hosting myself: about $${cost.toLocaleString("en-US")} a month right now. If it helps you and you can spare a little, chipping in keeps it free for everyone.`;

/** Dismissing is remembered per amount, so a changed amount is shown again. */
export const supportNoticeDismissKey = (cost: number) => `hourly:supportNotice:${cost}`;
