/**
 * THE colours of the app that mean something. Read the legend in docs/ui-spec.md ("Colour legend") before adding one:
 * a new hard-coded colour anywhere else fails `npm run check:rules` (scripts/check-colours.mjs).
 */
export const PALETTE = {
  /** The one accent (the hour hand): the main button, today, the open tab, focus. */
  accent: "#F5A524",
  /** The watch's ring (Today, Week) and progress lines (goal lines, the day's timesheet line): the brand blend. */
  brandBlend: ["#F5A524", "#ff7a45", "#ec5f9a", "#8a6cff"],
  /** Money states on Invoices: paid, waiting, late. Used for nothing else. */
  money: { paid: "#1fb8a0", waiting: "#8a6cff", late: "#ff5d73" },
  /** Bars and lines that are not "now": a soft grey that follows light and dark. */
  soft: "color-mix(in oklab, var(--foreground) 32%, transparent)",
} as const;
