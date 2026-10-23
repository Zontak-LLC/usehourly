/**
 * THE colours of the app that mean something. Read the legend in docs/ui-spec.md ("Colour legend") before adding one:
 * a new hard-coded colour anywhere else fails `npm run check:rules` (scripts/check-colours.mjs).
 */
export const PALETTE = {
  /** The one accent (the hour hand, a soft periwinkle since v4): the main button, today, the open tab, focus. */
  accent: "#5A63D8",
  /** Progress lines: the brand blend, sky to lavender (v4). */
  brandBlend: ["#6aa9d8", "#7c8ce4", "#9a86e6", "#b38ae2"],
  /** Money states on Invoices: paid, waiting, late. Used for nothing else. */
  money: { paid: "#1fb8a0", waiting: "#8a6cff", late: "#ff5d73" },
  /** Bars and lines that are not "now": a soft grey that follows light and dark. */
  soft: "color-mix(in oklab, var(--foreground) 32%, transparent)",
} as const;
