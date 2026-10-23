/*
 * How numbers are drawn (drawing audit, 2026-10-23). One display-weight figure per page or card: its main total. Every
 * other figure (an entry's time, a project's hours, a calendar cell, an invoice amount) is a ROW figure: the number font,
 * normal size, medium weight, so a 1-minute entry no longer shouts as loud as a 9-hour day.
 */

/** A figure in a row or a cell: an entry's time, a project's hours, an amount in a list. */
export const ROW_FIGURE = "font-mono font-semibold text-[15px] tabular-nums tracking-tight";

/** A very small amount (under 15 minutes): the same figure, quieter. */
export const ROW_FIGURE_QUIET = "font-mono font-medium text-[15px] text-foreground/60 tabular-nums tracking-tight";

/** Below this many minutes an entry's time is drawn quietly. */
export const QUIET_BELOW_MINUTES = 15;
