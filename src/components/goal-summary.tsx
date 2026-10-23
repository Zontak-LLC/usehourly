"use client";

import type { ReactNode } from "react";

import { useSweepIn } from "@/components/use-sweep-in";
import { PALETTE } from "@/lib/palette";

/**
 * A figure against a goal, without a clock: a label, the big figure, how far it is towards the goal as one progress line
 * (the brand blend, like every progress line), and a short foot. The app draws no clocks (see docs/ui-spec.md).
 */
export function GoalSummary({
  label,
  figure,
  goal,
  fraction,
  foot,
  children,
}: {
  label: string;
  figure: string;
  /** "of 160 h", said under the figure. */
  goal: string;
  /** 0 to 1. */
  fraction: number;
  foot?: string;
  /** Extra controls under the line (the Year summary's goal slider). */
  children?: ReactNode;
}) {
  const shown = useSweepIn(Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0)));
  return (
    <section
      aria-label={label}
      data-headerless="a figure with its goal, beside the tiles"
      className="flex h-full flex-col gap-3 rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
    >
      <span className="font-mono text-[11px] text-foreground/75 uppercase tracking-widest">{label}</span>
      <div>
        <p className="font-display font-extrabold text-5xl tabular-nums leading-none">{figure}</p>
        <p className="mt-1 text-foreground/75 text-sm">{goal}</p>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: progress towards the goal`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(1, fraction) * 100)}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-out"
          style={{ width: `${shown * 100}%`, background: `linear-gradient(90deg, ${PALETTE.brandBlend.join(", ")})` }}
        />
      </div>
      {foot && <p className="font-mono text-[11px] text-foreground/75 uppercase tracking-widest">{foot}</p>}
      {children}
    </section>
  );
}
