"use client";

import { useEffect, useState } from "react";

import { useMoney } from "@/components/currency-provider";
import { Dial } from "@/components/day-dial";
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
        <input
          id="year-goal"
          type="range"
          min={200}
          max={2400}
          step={100}
          value={goal}
          onChange={(e) => change(Number(e.target.value))}
          className={`mt-2 w-full ${RANGE_INPUT_CLASS}`}
        />
      </div>
    </div>
  );
}

/** Six big figures, work on the first row and money on the second, each with its plain-words note. */
export function YearFigures({ data }: { data: AnnualReport }) {
  const money = useMoney();
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const items: [string, string, string][] = [
    ["Hours worked", hours(data.totals.minutes), plural(data.totals.workedDays, "day")],
    [
      "Billable hours",
      hours(data.totals.billableMinutes),
      data.totals.nonBillableMinutes ? `${hours(data.totals.nonBillableMinutes)} non-billable` : "all of it",
    ],
    ["Earned", money(data.totals.earnedCents), "billable hours × rate"],
    ["Invoiced", money(data.invoices.totalCents), `${plural(data.invoices.count, "invoice")} issued`],
    ["Received", money(data.received.totalCents), `${plural(data.received.count, "payment")} · by paid date`],
    ["Outstanding", money(data.outstanding.totalCents), `${data.outstanding.count} unpaid at year end`],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3">
      {items.map(([label, value, hint], i) => (
        <div key={label} className="flex flex-col border-amber/70 border-t-2 pt-3">
          <dd
            className={`order-1 font-display font-extrabold text-3xl tabular-nums leading-none sm:text-4xl ${i === 2 ? "text-amber-700 dark:text-amber" : ""}`}
          >
            {value}
          </dd>
          <dt className="order-2 mt-2 font-mono text-[11px] text-foreground/75 uppercase tracking-widest">{label}</dt>
          <p className="order-3 text-muted-foreground text-xs">{hint}</p>
        </div>
      ))}
    </dl>
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
      aria-label="Month by month"
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
                className="w-full rounded-t-lg bg-gradient-to-t from-amber to-[color-mix(in_oklab,var(--amber)_55%,white)] outline-none transition-[height,opacity] duration-500 focus-visible:ring-4 focus-visible:ring-amber/40 group-hover:opacity-80"
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
