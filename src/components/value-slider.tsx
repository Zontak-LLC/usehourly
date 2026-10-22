"use client";

import { RANGE_INPUT_CLASS } from "@/components/time-ruler";

/**
 * A plain slider with an amber fill for a number (a rate, a budget). It only draws and reports: the caller keeps the
 * value, usually next to a number box that moves the same value, so the exact amount can still be typed.
 */
export function ValueSlider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  valueText,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
  valueText?: string;
}) {
  const clamped = Math.min(max, Math.max(min, value));
  const pct = (clamped - min) / (max - min);
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
        min={min}
        max={max}
        step={step}
        value={clamped}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        className={RANGE_INPUT_CLASS}
      />
    </div>
  );
}
