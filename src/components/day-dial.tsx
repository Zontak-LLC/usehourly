"use client";

import { useEffect, useId, useState } from "react";

import { DAY_GOAL_MINUTES, DIAL_LENGTH, dialFraction, dialLeft } from "@/lib/day-dial";
import { formatDuration } from "@/lib/duration";
import { round3 } from "@/lib/round3";

/** The day dial's ring is a little spectrum, sky to violet to pink, so it brightens the page. */
const DAY_RING = ["#4f8cff", "#8A6CFF", "#ec5f9a"] as const;

const TICKS = Array.from({ length: 48 }, (_, i) => {
  const a = (i / 48) * Math.PI * 2;
  const long = i % 6 === 0;
  const r2 = long ? 88 : 92;
  return {
    key: i,
    x1: round3(100 + 96 * Math.sin(a)),
    y1: round3(100 - 96 * Math.cos(a)),
    x2: round3(100 + r2 * Math.sin(a)),
    y2: round3(100 - r2 * Math.cos(a)),
    long,
  };
});

/**
 * The day as a dial: the ring fills with the hours logged against the day's goal, the hand sits where the fill ends,
 * and the middle says the total and what is left. While a timer runs on the day shown, its minutes are part of the
 * total (the title says "Logged + timer") and a thin second hand sweeps: there is one clock for the day, not two. The ring sweeps in
 * from empty on first show, so a person sees the day add up.
 */
export function DayDial({
  minutes,
  weekMinutes,
  timerRunning,
  timerCounted = false,
  goal = DAY_GOAL_MINUTES,
}: {
  /** Logged minutes, plus the running timer's minutes when `timerCounted`. */
  minutes: number;
  weekMinutes: number | null;
  timerRunning: boolean;
  /** The running timer is part of `minutes` (it runs on the day shown): the dial says so and grows with it. */
  timerCounted?: boolean;
  goal?: number;
}) {
  return (
    <Dial
      label="Today's hours"
      title={timerCounted ? "Logged + timer" : "Logged"}
      minutes={minutes}
      goal={goal}
      timerRunning={timerRunning}
      ring={DAY_RING}
      footLeft={`Goal ${formatDuration(goal)}`}
      footRight={weekMinutes !== null ? `Week ${formatDuration(weekMinutes)}` : undefined}
    />
  );
}

/**
 * The dial every page's left column uses: the ring fills with `minutes` against `goal`, the hand sits where the fill
 * ends and the middle names the figure. `center` replaces the time in the middle (the Invoices dial shows money).
 */
export function Dial({
  label,
  title,
  minutes,
  goal,
  timerRunning = false,
  center,
  caption,
  footLeft,
  footRight,
  ring,
}: {
  label: string;
  title: string;
  minutes: number;
  goal: number;
  timerRunning?: boolean;
  center?: string;
  caption?: string;
  footLeft?: string;
  footRight?: string;
  /** Three colours for the ring (a gradient round the dial); the amber of the brand when left out. */
  ring?: readonly [string, string, string];
}) {
  const gradientId = useId();
  const [shown, setShown] = useState(0);
  // After the first paint, move to the real value: the CSS transition draws the sweep.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(minutes));
    return () => cancelAnimationFrame(id);
  }, [minutes]);
  const fraction = dialFraction(shown, goal);

  return (
    <section
      aria-label={label}
      className="relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl border bg-card p-5 shadow-[var(--shadow-sheet)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-20%] bottom-[-45%] h-[70%] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--amber)_22%,transparent),transparent)]"
      />
      <div className="relative aspect-square w-full max-w-[210px] sm:max-w-[300px]">
        <svg viewBox="0 0 200 200" className="size-full overflow-visible" aria-hidden>
          {ring && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={ring[0]} />
                <stop offset="0.55" stopColor={ring[1]} />
                <stop offset="1" stopColor={ring[2]} />
              </linearGradient>
            </defs>
          )}
          {TICKS.map((t) => (
            <line
              key={t.key}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke="var(--border)"
              strokeWidth={t.long ? 2 : 1}
            />
          ))}
          <circle cx="100" cy="100" r="78" fill="none" stroke="var(--muted)" strokeWidth="16" />
          <circle
            cx="100"
            cy="100"
            r="78"
            fill="none"
            stroke={ring ? `url(#${gradientId})` : "var(--amber)"}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={DIAL_LENGTH}
            strokeDashoffset={DIAL_LENGTH * (1 - fraction)}
            transform="rotate(-90 100 100)"
            style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)" }}
          />
          <g
            style={{
              transformOrigin: "100px 100px",
              transform: `rotate(${fraction * 360}deg)`,
              transition: "transform 1.1s cubic-bezier(.2,.8,.2,1)",
            }}
          >
            <line x1="100" y1="40" x2="100" y2="8" stroke="var(--foreground)" strokeWidth="3" strokeLinecap="round" />
            <circle cx="100" cy="22" r="4" fill="var(--card)" stroke="var(--foreground)" strokeWidth="2" />
          </g>
          {timerRunning && (
            <g
              className="origin-center motion-safe:animate-[spin_60s_linear_infinite]"
              style={{ transformOrigin: "100px 100px" }}
            >
              <line x1="100" y1="44" x2="100" y2="4" stroke="var(--amber)" strokeWidth="1.5" strokeLinecap="round" />
            </g>
          )}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">{title}</span>
          <span
            className={`font-display font-extrabold tabular-nums leading-none ${center ? "text-4xl" : "text-5xl"}`}
            aria-live={timerRunning ? "off" : "polite"}
          >
            {center ?? formatDuration(minutes)}
          </span>
          <span className="mt-1 font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
            {caption ?? dialLeft(minutes, goal)}
          </span>
        </div>
      </div>
      <div className="relative flex w-full items-center justify-between font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
        <span>{footLeft}</span>
        {footRight && <span>{footRight}</span>}
      </div>
    </section>
  );
}
