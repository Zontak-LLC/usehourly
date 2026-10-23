"use client";

import { useEffect, useState } from "react";

import { useMoney } from "@/components/currency-provider";
import { GoalSummary } from "@/components/goal-summary";
import { RANGE_INPUT_CLASS } from "@/components/range-input";
import { formatDuration } from "@/lib/duration";
import { count } from "@/lib/plural";

import type { AnnualReport } from "./report-body";
import { SummaryRow } from "./report-table";

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

/** Hours on screen are h:mm, as everywhere else in the app (files keep decimals). */
const hours = (m: number) => formatDuration(Math.round(m));

function readGoal(): number {
  try {
    const n = Number(window.localStorage.getItem("hourly:goal:year"));
    return Number.isFinite(n) && n >= 200 && n <= 2400 ? n : 1800;
  } catch {
    return 1800;
  }
}

/** The year's hours against a goal, with a slider that moves the goal (kept on this device). */
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
    <GoalSummary
      label={`Hours in ${year}`}
      figure={hours(data.totals.minutes)}
      goal={`of a ${goal} hour year`}
      fraction={data.totals.minutes / (goal * 60)}
      foot={`${count(data.totals.workedDays, "day")} worked`}
    >
      <div>
        <label
          htmlFor="year-goal"
          className="flex items-baseline justify-between font-mono text-[11px] text-foreground/75 uppercase tracking-widest"
        >
          Yearly goal
          <span className="font-mono font-semibold text-foreground text-sm normal-case tracking-normal">{goal} h</span>
        </label>
        <div className="relative mt-2 h-6">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/40"
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
    </GoalSummary>
  );
}

/**
 * The money of the year (drawing audit, 2026-10-23): ONE main figure, what the year's work is worth, and the rest as
 * quiet lines. It replaced six equal stat tiles that shouted together (and showed the hours twice, beside the dial).
 */
export function YearFigures({ data }: { data: AnnualReport }) {
  const money = useMoney();
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const t = data.totals;
  return (
    <section
      aria-label="Money this year"
      className="flex h-full flex-col rounded-3xl bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
    >
      <div className="flex flex-col gap-1 p-5 pb-4">
        <span className="font-mono text-[11px] text-foreground/75 uppercase tracking-widest">Earned</span>
        <p className="font-display font-extrabold text-5xl tabular-nums leading-none">{money(t.earnedCents)}</p>
        <p className="text-foreground/75 text-sm">billable hours × each project's rate</p>
      </div>
      <dl className="mt-auto">
        {/* On a phone the hours dial is hidden, so its figure is a line here. */}
        <div className="border-t lg:hidden">
          <SummaryRow label="Hours worked" value={hours(t.minutes)} hint={plural(t.workedDays, "day")} />
        </div>
        <SummaryRow
          label="Billable hours"
          value={hours(t.billableMinutes)}
          hint={t.nonBillableMinutes ? `${hours(t.nonBillableMinutes)} non-billable` : "all of it"}
        />
        <SummaryRow
          label="Invoiced"
          value={money(data.invoices.totalCents)}
          hint={`${plural(data.invoices.count, "invoice")} issued`}
        />
        <SummaryRow
          label="Received"
          value={money(data.received.totalCents)}
          hint={`${plural(data.received.count, "payment")} · by paid date`}
        />
        <SummaryRow
          label="Outstanding"
          value={money(data.outstanding.totalCents)}
          hint={`${data.outstanding.count} unpaid at year end`}
        />
      </dl>
    </section>
  );
}

/** Twelve bars, one per month: switch between hours and earnings; hover or focus a bar to read it. */
export function YearChart({ data }: { data: AnnualReport }) {
  const money = useMoney();
  const [mode, setMode] = useState<"earned" | "hours">("earned");
  const values = data.months.map((m) => (mode === "earned" ? m.earnedCents : m.minutes));
  const max = Math.max(1, ...values);
  const read = (v: number) => (mode === "earned" ? money(v) : hours(v));
  // Only the latest month with time is yellow; the rest are a soft grey.
  const latest = values.reduce((at, v, i) => (v > 0 ? i : at), -1);
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
                mode === m ? "bg-foreground text-background" : "text-foreground/75 hover:text-foreground"
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
                className={`w-full rounded-t-lg outline-none focus-visible:ring-4 focus-visible:ring-amber/40 group-hover:opacity-80 ${i === latest ? "bg-amber" : "bg-foreground/30"}`}
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
