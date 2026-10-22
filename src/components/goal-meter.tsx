"use client";

import { useEffect, useState } from "react";

import { RANGE_INPUT_CLASS } from "@/components/time-ruler";
import { formatDuration } from "@/lib/duration";

/** The goal lives in this browser (a convenience, not account data); a stored value outside the range is ignored. */
function readGoal(id: string, fallback: number, min: number, max: number): number {
  try {
    const n = Number(window.localStorage.getItem(`hourly:goal:${id}`));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  } catch {
    return fallback;
  }
}

/**
 * A summary as a line instead of a dial: a big figure, an amber line that fills against a goal, and a slider under it
 * that moves the goal (kept on this device). Use it where a page's list is long and a dial would leave empty room.
 */
export function GoalMeter({
  id,
  label,
  minutes,
  defaultGoalHours,
  minHours,
  maxHours,
  stepHours = 5,
  note,
}: {
  id: string;
  label: string;
  minutes: number;
  defaultGoalHours: number;
  minHours: number;
  maxHours: number;
  stepHours?: number;
  note?: string;
}) {
  const [goal, setGoal] = useState(defaultGoalHours);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    setGoal(readGoal(id, defaultGoalHours, minHours, maxHours));
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [id, defaultGoalHours, minHours, maxHours]);

  const pct = Math.min(100, (minutes / (goal * 60)) * 100);
  const change = (hours: number) => {
    setGoal(hours);
    try {
      window.localStorage.setItem(`hourly:goal:${id}`, String(hours));
    } catch {
      // the goal simply is not remembered
    }
  };

  return (
    <section
      aria-label={label}
      data-headerless="a summary line with a goal slider"
      className="flex flex-col gap-3 rounded-3xl border bg-card px-4 py-4 shadow-[var(--shadow-sheet)]"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">{label}</p>
          <p className="font-display font-extrabold text-4xl tabular-nums leading-none">{formatDuration(minutes)}</p>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
          {note ?? `${Math.round(pct)}% of ${goal} h`}
        </p>
      </div>
      <div aria-hidden className="h-2.5 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-amber"
          style={{ width: grown ? `${pct}%` : "0%", transition: "width 1s cubic-bezier(.2,.8,.2,1)" }}
        />
      </div>
      <div className="relative">
        <div className="relative h-6">
          <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border" />
          <input
            type="range"
            min={minHours}
            max={maxHours}
            step={stepHours}
            value={goal}
            aria-label={`${label}: goal in hours`}
            aria-valuetext={`${goal} hours`}
            onChange={(e) => change(Number(e.target.value))}
            className={RANGE_INPUT_CLASS}
          />
        </div>
        <p aria-hidden className="mt-0.5 text-center font-mono text-[11px] text-muted-foreground">
          Goal {goal} h · drag to change
        </p>
      </div>
    </section>
  );
}
