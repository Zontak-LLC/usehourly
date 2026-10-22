"use client";

import type { ReactNode } from "react";

const RING = 2 * Math.PI * 22;

/** A small ring that fills to `fraction` (0 to 1): the drawing for a figure that is a share of something. */
export function TileRing({
  fraction,
  label,
  colour = "var(--amber)",
}: {
  fraction: number;
  label: string;
  colour?: string;
}) {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  return (
    <svg viewBox="0 0 56 56" role="img" aria-label={label} className="size-14 -rotate-90">
      <title>{label}</title>
      <circle cx="28" cy="28" r="22" fill="none" stroke="var(--muted)" strokeWidth="6" />
      <circle
        cx="28"
        cy="28"
        r="22"
        fill="none"
        stroke={colour}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={RING}
        strokeDashoffset={RING * (1 - f)}
      />
    </svg>
  );
}

/**
 * A stat tile: a mono label, a big figure that shows, an optional note, and a small
 * drawing on the right that says what the figure is a share of. `display` turns the counted number into words
 * (money, hours); the default is the plain number. The tile itself stays still.
 */
export function StatTile({
  label,
  value,
  display = String,
  hint,
  tone = "",
  children,
  className = "",
  corner = false,
  accent,
  title,
}: {
  label: string;
  value: number;
  display?: (n: number) => string;
  hint?: string;
  tone?: string;
  children?: ReactNode;
  className?: string;
  /** Put the drawing in the top corner and let the figure use the whole width (for long figures such as money). */
  corner?: boolean;
  /** A colour for the top edge (a client's own colour, for example). */
  accent?: string;
  /** A line above the figure, such as a name with its colour dot. */
  title?: ReactNode;
}) {
  return (
    <dl
      style={accent ? { borderTop: `3px solid ${accent}` } : undefined}
      className={`relative flex gap-3 overflow-hidden rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 ${corner ? "flex-col justify-end" : "items-center justify-between"} ${className}`}
    >
      <div className="min-w-0">
        {title && (
          <p className="mb-3 flex items-center gap-2 truncate font-display font-extrabold text-lg leading-tight">
            {title}
          </p>
        )}
        <dd
          className={`order-1 font-display font-extrabold ${corner ? "text-3xl" : "truncate text-4xl"} tabular-nums leading-none ${tone}`}
        >
          {display(value)}
        </dd>
        <dt className="order-2 mt-2 font-mono text-[11px] text-foreground/75 uppercase tracking-widest">{label}</dt>
        {hint && <p className="mt-1 text-muted-foreground text-xs">{hint}</p>}
      </div>
      {children && (
        <div aria-hidden className={corner ? "absolute top-4 right-4 origin-top-right scale-75" : "shrink-0"}>
          {children}
        </div>
      )}
    </dl>
  );
}
