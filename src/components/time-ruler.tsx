"use client";

import { formatDuration } from "@/lib/duration";

/** The look of the draggable range input (a ringed round thumb on a transparent track) every slider here shares. */
export const RANGE_INPUT_CLASS =
  "absolute inset-0 h-6 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-foreground [&::-moz-range-thumb]:bg-card [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-foreground [&::-webkit-slider-thumb]:bg-card [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgb(0_0_0/0.25)] [&::-webkit-slider-thumb]:transition-transform focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-ring/30 active:[&::-webkit-slider-thumb]:scale-110";

const MAX = 8 * 60;
const STEP = 15;
const MARKS = [0, 120, 240, 360, 480];

/**
 * A ruler for the time you are adding: drag the thumb in 15 minute steps, up to eight hours; the amber fill follows,
 * a bubble over the thumb says the time. It is a real range input underneath, so the keyboard (arrows, Home, End)
 * and screen readers work. A time typed beyond eight hours parks the thumb at the end.
 */
export function TimeRuler({ minutes, onChange }: { minutes: number; onChange: (minutes: number) => void }) {
  const value = Math.min(MAX, Math.max(0, Math.round(minutes / STEP) * STEP));
  const pct = (value / MAX) * 100;
  return (
    <div className="relative px-3 pt-8 pb-1">
      {/* the bubble rides the thumb */}
      <span
        aria-hidden
        className={`pointer-events-none absolute top-0 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 font-mono text-[11px] text-background tabular-nums transition-[left,opacity] duration-200 ${
          minutes > 0 ? "opacity-100" : "opacity-0"
        }`}
        style={{ left: `calc(12px + (100% - 24px) * ${pct / 100})` }}
      >
        {minutes > MAX ? "8h+" : formatDuration(value)}
      </span>
      <div className="relative h-6">
        {/* track, ticks and fill */}
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-amber transition-[width] duration-200"
            style={{ width: `calc(12px + (100% - 24px) * ${pct / 100})` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={MAX}
          step={STEP}
          value={value}
          aria-label="Time on a ruler"
          aria-valuetext={value ? formatDuration(value) : "nothing yet"}
          onChange={(e) => onChange(Number(e.target.value))}
          className={RANGE_INPUT_CLASS}
        />
      </div>
      <div aria-hidden className="mt-1 flex justify-between px-1 font-mono text-[10px] text-muted-foreground">
        {MARKS.map((m) => (
          <span key={m}>{m === 0 ? "0" : `${m / 60}h`}</span>
        ))}
      </div>
    </div>
  );
}
