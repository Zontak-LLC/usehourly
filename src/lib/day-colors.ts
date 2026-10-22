/** Yellow is small on purpose (the main button, today, the open tab). Bars and lines are a soft grey; only "today" uses the accent. */
const SOFT = "color-mix(in oklab, var(--foreground) 32%, transparent)";
export const DAY_COLORS = [SOFT, SOFT, SOFT, SOFT, SOFT, SOFT, SOFT] as const;
export const TODAY_COLOR = "#F5A524";
