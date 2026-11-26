"use client";

import type { KeyboardEvent } from "react";

import { RANGE_INPUT_CLASS } from "@/components/range-input";
import { budgetStopIndex } from "@/lib/budget-scale";

const ARROW_DIRECTION: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

/**
 * A plain slider with an amber fill for a number (a rate, a budget). It only draws and reports: the caller keeps the
 * value, usually next to a number box that moves the same value, so the exact amount can still be typed.
 * With `stops` the track runs over those values (min, max and step are ignored) and the arrows move one first-gap step.
 */
export function ValueSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  stops,
  onChange,
  label,
  valueText,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  stops?: readonly number[];
  onChange: (v: number) => void;
  label: string;
  valueText?: string;
}) {
  const first = stops ? 0 : min;
  const last = stops ? stops.length - 1 : max;
  const current = stops ? budgetStopIndex(value, stops) : Math.min(max, Math.max(min, value));
  const pct = (current - first) / (last - first);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const direction = ARROW_DIRECTION[e.key];
    if (!stops || !direction) return;
    e.preventDefault();
    const moved = stops[current] + direction * (stops[1] - stops[0]);
    onChange(Math.min(stops[last], Math.max(stops[0], moved)));
  }

  return (
    <div className="relative h-6 min-w-32 flex-1">
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-amber transition-[width] duration-150"
          style={{ width: `calc(12px + (100% - 24px) * ${pct})` }}
        />
      </div>
      <input
        type="range"
        min={first}
        max={last}
        step={stops ? 1 : step}
        value={current}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(stops ? stops[n] : n);
        }}
        onKeyDown={onKeyDown}
        className={RANGE_INPUT_CLASS}
      />
    </div>
  );
}
