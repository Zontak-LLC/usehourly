"use client";

import { useState } from "react";

import { RANGE_INPUT_CLASS } from "@/components/time-ruler";

/**
 * A slider with named stops, for a choice from a short list (round to 0, 6, 15 or 30 minutes). The amber line grows to
 * the chosen stop and the stop's name sits under it; it is a real range input, so arrows, Home and End work. It holds
 * its own value and also writes it into a hidden input called `name`, so a plain form (read with FormData) still gets it.
 */
export function StopSlider({
  name,
  label,
  options,
  defaultValue,
  onChange,
}: {
  name: string;
  /** Names the slider for a screen reader. */
  label: string;
  options: { value: number; label: string }[];
  defaultValue: number;
  /** Called with the chosen option's value each time the slider moves. */
  onChange?: (value: number) => void;
}) {
  const start = Math.max(
    0,
    options.findIndex((o) => o.value === defaultValue),
  );
  const [index, setIndex] = useState(start);
  const last = Math.max(1, options.length - 1);
  return (
    <div className="grid gap-1">
      <input type="hidden" name={name} value={options[index].value} />
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-amber transition-[width] duration-200"
            style={{ width: `calc(12px + (100% - 24px) * ${index / last})` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={options.length - 1}
          step={1}
          value={index}
          aria-label={label}
          aria-valuetext={options[index].label}
          onChange={(e) => {
            const next = Number(e.target.value);
            setIndex(next);
            onChange?.(options[next].value);
          }}
          className={RANGE_INPUT_CLASS}
        />
      </div>
      <div aria-hidden className="relative flex justify-between px-1 font-mono text-[10px] text-muted-foreground">
        {options.map((o, i) => (
          <span key={o.value} className={i === index ? "font-semibold text-foreground" : ""}>
            {o.label}
          </span>
        ))}
      </div>
      <p className="font-display font-extrabold text-base">{options[index].label}</p>
    </div>
  );
}
