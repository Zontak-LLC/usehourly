import { formatCount } from "@/lib/money";

/**
 * The "chip in" notice (owner-controlled). UseHourly is free and costs the owner real money to host, so if the bill ever
 * gets too large the owner can switch a small, dismissible note on Today that says what hosting costs and links to the
 * donation page. It is shown inside the app, never emailed: /privacy promises no marketing email.
 * The saved value is read and checked on the server only (`src/server/schemas/support-notice.ts`), so the dashboard
 * layout, which shows the notice, does not load zod (issue 425).
 */
export const SUPPORT_NOTICE_KEY = "support_notice";
export const MAX_NOTICE_COST = 10_000;

export type SupportNotice = { on: boolean; cost: number };

export const supportNoticeText = (cost: number) =>
  `UseHourly is free, and I pay for the hosting myself: about $${formatCount(cost)} a month right now. If it helps you and you can spare a little, chipping in keeps it free for everyone.`;

/** Dismissing is remembered per amount, so a changed amount is shown again. */
export const supportNoticeDismissKey = (cost: number) => `hourly:supportNotice:${cost}`;
