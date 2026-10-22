"use client";

import { useEffect, useState } from "react";

import { useMoney } from "@/components/currency-provider";
import { Dial } from "@/components/day-dial";
import { StatTile, TileRing } from "@/components/stat-tile";
import { RANGE_INPUT_CLASS } from "@/components/time-ruler";
import { formatDecimalHours } from "@/lib/duration";

import type { AnnualReport } from "./report-body";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const hours = (m: number) => `${formatDecimalHours(m)} h`;

function readGoal(): number {
  try {
    const n = Number(window.localStorage.getItem("hourly:goal:year"));
    return Number.isFinite(n) && n >= 200 && n <= 2400 ? n : 1800;
  } catch {
    return 1800;
  }
}

/** The year as the dial the other pages use (hours against a goal), with a slider that moves the goal (kept on this device). */
export function YearDial({ data, year }: { data: AnnualReport; year: number }) {
  const [goal, setGoal] = useState(1800);
  useEffect(() => setGoal(readGoal()), []);
  const change = (value: number) => {
    setGoal(value);
    try {
      window.localStorage.setItem("hourly:goal:year", String(value));
    } catch {
      // the goal simply is not remembered
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <Dial
        label={`Hours in ${year}`}
        title={`${year}`}
        minutes={data.totals.minutes}
        goal={goal * 60}
        footLeft={`Goal ${goal} h`}
        footRight={`${data.totals.workedDays} days worked`}
      />
      <div className="px-2">
        <label
          htmlFor="year-goal"
          className="flex items-baseline justify-between font-mono text-[11px] text-foreground/75 uppercase tracking-widest"
        >
          Yearly goal
          <span className="font-display font-extrabold text-base text-foreground normal-case tracking-normal">
            {goal} h
          </span>
        </label>
        <div className="relative mt-2 h-6">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-amber"
              style={{ width: `calc(12px + (100% - 24px) * ${(goal - 200) / 2200})` }}
            />
          </div>
          <input
            id="year-goal"
            type="range"
            min={200}
            max={2400}
            step={100}
            value={goal}
            onChange={(e) => change(Number(e.target.value))}
            className={RANGE_INPUT_CLASS}
          />
        </div>
      </div>
    </div>
  );
}

/** Six stat tiles: each figure counts up and carries a ring for the share it is of the figure it comes from. */
export function YearFigures({ data }: { data: AnnualReport }) {
  const money = useMoney();
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const t = data.totals;
  const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
  const items: {
    label: string;
    value: number;
    display: (n: number) => string;
    hint: string;
    ring: number;
    ringLabel: string;
    tone?: string;
  }[] = [
    {
      label: "Hours worked",
      value: t.minutes,
      display: hours,
      hint: plural(t.workedDays, "day"),
      ring: share(t.minutes, 1800 * 60),
      ringLabel: "Share of the yearly goal",
    },
    {
      label: "Billable hours",
      value: t.billableMinutes,
      display: hours,
      hint: t.nonBillableMinutes ? `${hours(t.nonBillableMinutes)} non-billable` : "all of it",
      ring: share(t.billableMinutes, t.minutes),
      ringLabel: "Share of hours that are billable",
    },
    {
      label: "Earned",
      value: t.earnedCents,
      display: money,
      hint: "billable hours × rate",
      ring: share(data.invoices.totalCents, t.earnedCents),
      ringLabel: "Share of earnings invoiced",
      tone: "text-amber-700 dark:text-amber",
    },
    {
      label: "Invoiced",
      value: data.invoices.totalCents,
      display: money,
      hint: `${plural(data.invoices.count, "invoice")} issued`,
      ring: share(data.received.totalCents, data.invoices.totalCents),
      ringLabel: "Share of invoiced money received",
    },
    {
      label: "Received",
      value: data.received.totalCents,
      display: money,
      hint: `${plural(data.received.count, "payment")} · by paid date`,
      ring: share(data.received.totalCents, data.invoices.totalCents),
      ringLabel: "Share of invoiced money received",
    },
    {
      label: "Outstanding",
      value: data.outstanding.totalCents,
      display: money,
      hint: `${data.outstanding.count} unpaid at year end`,
      ring: share(data.outstanding.totalCents, data.invoices.totalCents),
      ringLabel: "Share of invoiced money still unpaid",
    },
  ];
  return (
    <div className="grid h-full auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {items.map((i) => (
        <StatTile key={i.label} label={i.label} value={i.value} display={i.display} hint={i.hint} tone={i.tone} corner>
          <TileRing fraction={i.ring} label={i.ringLabel} />
        </StatTile>
      ))}
    </div>
  );
}

/** Twelve bars, one per month: switch between hours and earnings; hover or focus a bar to read it. */
export function YearChart({ data }: { data: AnnualReport }) {
  const money = useMoney();
  const [mode, setMode] = useState<"earned" | "hours">("earned");
  const values = data.months.map((m) => (mode === "earned" ? m.earnedCents : m.minutes));
  const max = Math.max(1, ...values);
  const read = (v: number) => (mode === "earned" ? money(v) : hours(v));
  return (
    <section
      aria-label="Monthly bars"
      className="rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display font-extrabold text-xl">Month by month</h2>
        <fieldset aria-label="Show" className="m-0 flex gap-1 rounded-full border-0 bg-muted p-1">
          {(["earned", "hours"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-8 rounded-full px-4 font-semibold text-sm capitalize transition-colors ${
                mode === m ? "bg-amber text-[#1b1405]" : "text-foreground/75 hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </fieldset>
      </div>
      <ul className="mt-5 grid h-44 grid-cols-12 items-end gap-1.5 sm:gap-3">
        {data.months.map((m, i) => {
          const v = values[i];
          const pct = Math.max(v ? 4 : 0, (v / max) * 100);
          return (
            <li key={m.month} className="group relative flex h-full flex-col justify-end">
              <span
                aria-hidden
                className="pointer-events-none absolute left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-0.5 font-mono text-[11px] text-background opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                style={{ bottom: `${pct}%` }}
              >
                {read(v)}
              </span>
              <button
                type="button"
                aria-label={`${MONTH_NAMES[m.month - 1]}: ${read(v)}`}
                className="w-full rounded-t-lg bg-gradient-to-t from-amber to-[color-mix(in_oklab,var(--amber)_55%,white)] outline-none focus-visible:ring-4 focus-visible:ring-amber/40 group-hover:opacity-80"
                style={{ height: `${pct}%`, opacity: v ? 1 : 0.18 }}
              />
            </li>
          );
        })}
      </ul>
      <div
        aria-hidden
        className="mt-2 grid grid-cols-12 gap-1.5 text-center font-mono text-[10px] text-foreground/75 uppercase sm:gap-3"
      >
        {data.months.map((m) => (
          <span key={m.month}>{MONTH_NAMES[m.month - 1][0]}</span>
        ))}
      </div>
    </section>
  );
}
