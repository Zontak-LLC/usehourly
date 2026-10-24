"use client";

import { useState } from "react";

import { useMoney } from "@/components/currency-provider";
import { h as hours, MONTHS as MONTH_NAMES, yearFigures } from "@/lib/year-summary-rows";

import type { AnnualReport } from "./report-body";
import { SummaryRow } from "./report-table";

/**
 * The year in money, led by what actually came in (issue 219, 2026-10-23): Received and Unpaid are the two figures, the
 * rest are quiet lines. "Earned" (billable hours × today's rates) is what the time is worth, not income, so it is a line
 * with that said under it. The hours goal card and its slider were removed: they repeated the figures.
 */
export function YearFigures({ data, year }: { data: AnnualReport; year: number }) {
  const money = useMoney();
  const [received, unpaid, ...lines] = yearFigures(data, money);
  return (
    <section
      aria-label={`Money in ${year}`}
      className="rounded-3xl bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
    >
      <div className="grid gap-5 p-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-foreground/75 uppercase tracking-widest">{received.label}</span>
          <p className="font-display font-extrabold text-5xl tabular-nums leading-none">{received.value}</p>
          <p className="text-foreground/75 text-sm">{received.hint}</p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-foreground/75 uppercase tracking-widest">{unpaid.label}</span>
          <p className="font-bold font-display text-3xl tabular-nums leading-none sm:mt-2">{unpaid.value}</p>
          <p className="text-foreground/75 text-sm">{unpaid.hint}</p>
        </div>
      </div>
      <dl className="grid border-t sm:grid-cols-2 sm:[&>*:nth-child(2)]:border-t-0 sm:[&>*:nth-child(odd)]:border-r">
        {lines.map((f) => (
          <SummaryRow key={f.label} label={f.label} value={f.value} hint={f.hint} />
        ))}
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
                className={`w-full rounded-t-lg outline-none focus-visible:ring-4 focus-visible:ring-amber/40 group-hover:opacity-80 ${i === latest ? "bg-amber-fill" : "bg-foreground/30"}`}
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
