"use client";

import type { ReactNode } from "react";

import { useCountUp } from "@/lib/use-count-up";

const RING = 2 * Math.PI * 22;

/** A small ring that fills to `fraction` (0 to 1): the drawing for a figure that is a share of something. */
export function TileRing({ fraction, label }: { fraction: number; label: string }) {
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
        stroke="var(--amber)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={RING}
        strokeDashoffset={RING * (1 - f)}
        style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)" }}
      />
    </svg>
  );
}

/**
 * A stat tile: a mono label, a big figure that counts up when the tile first shows, an optional note, and a small
 * drawing on the right that says what the figure is a share of. `display` turns the counted number into words
 * (money, hours); the default is the plain number. The tile settles in and lifts a little on hover.
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
}) {
  const shown = useCountUp(value);
  return (
    <dl
      className={`relative flex gap-3 overflow-hidden rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 transition-all duration-300 motion-safe:animate-[settle_0.6s_ease-out_both] motion-safe:hover:-translate-y-0.5 motion-safe:hover:ring-amber/60 ${corner ? "flex-col justify-end" : "items-center justify-between"} ${className}`}
    >
      <div className="min-w-0">
        <dd
          className={`order-1 font-display font-extrabold ${corner ? "text-3xl" : "truncate text-4xl"} tabular-nums leading-none ${tone}`}
        >
          {display(shown)}
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
