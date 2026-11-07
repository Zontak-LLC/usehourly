"use client";

import { useRef, useState } from "react";

import { FormStep } from "@/components/form-step";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { addDays, fromISODate } from "@/lib/dates";
import { PRESETS, type PresetKey, presetRange } from "@/lib/export-range";

export type InvoiceDetailsValues = {
  clientId: string;
  number: string;
  from: string;
  to: string;
  netDays: string;
  notes: string;
  includeDetail: boolean;
  compactNotes: boolean;
};

const QUICK_PERIODS: PresetKey[] = ["this-month", "last-month", "last-30", "this-quarter", "year-to-date"];
const TERMS = [0, 15, 30, 45, 60];
const dueFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

/** Every choice chip on this form (period and due date) is drawn the same way; the chosen one is ink. */
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition-all motion-safe:active:scale-95 ${
    on
      ? "border-foreground bg-foreground font-semibold text-background"
      : "bg-muted/50 hover:border-foreground/30 hover:bg-muted"
  }`;

export function InvoiceDetailsCard({
  clients,
  values,
  today,
  onClientId,
  onNumber,
  onFrom,
  onTo,
  onNetDays,
  onNotes,
  onIncludeDetail,
  onCompactNotes,
}: {
  clients: { id: string; name: string }[];
  values: InvoiceDetailsValues;
  /** Today's date in the browser (quick periods and the due date count from it). */
  today: string;
  onClientId: (v: string) => void;
  /** Called when the user types the number (so the suggested number stops overwriting it). */
  onNumber: (v: string) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onNetDays: (v: string) => void;
  onNotes: (v: string) => void;
  onIncludeDetail: (v: boolean) => void;
  onCompactNotes: (v: boolean) => void;
}) {
  const { clientId, number, from, to, netDays, notes, includeDetail, compactNotes } = values;
  const days = Math.min(365, Math.max(0, Number.parseInt(netDays, 10) || 0));
  const isTerm = TERMS.includes(Number(netDays));
  // "Other…" shows the number box for an unusual term; it stays open while the value is not a chip.
  const [otherOpen, setOtherOpen] = useState(false);
  const showOther = otherOpen || !isTerm;
  const moreRef = useRef<HTMLDetailsElement>(null);
  const dueLabel = days === 0 ? "Due on receipt" : `Due ${dueFormat.format(fromISODate(addDays(today, days)))}`;

  return (
    <div className="flex flex-col gap-6 rounded-3xl border bg-card p-4 shadow-[var(--shadow-sheet)] sm:p-5">
      <FormStep n={1} title="Who is it for?">
        <div className="grid gap-1.5 sm:max-w-sm">
          <Label htmlFor="client">Client</Label>
          <NativeSelect id="client" value={clientId} onChange={(e) => onClientId(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </FormStep>

      <FormStep n={2} title="Which time?">
        {/* One tap sets the whole period; the dates below are for anything else. */}
        <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">Quick periods</legend>
          {QUICK_PERIODS.map((key) => {
            const range = presetRange(key, today);
            const on = range.from === from && range.to === to;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onFrom(range.from);
                  onTo(range.to);
                }}
                className={chip(on)}
              >
                {PRESETS.find((p) => p.key === key)?.label}
              </button>
            );
          })}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => onFrom(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => onTo(e.target.value)} required />
          </div>
        </div>
      </FormStep>

      <FormStep n={3} title="When is it due?">
        <div className="flex flex-col gap-2">
          <p className="font-medium text-foreground text-sm">{dueLabel}</p>
          <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0">
            <legend className="sr-only">Payment due</legend>
            {TERMS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={!showOther && days === t}
                onClick={() => {
                  setOtherOpen(false);
                  onNetDays(String(t));
                }}
                className={chip(!showOther && days === t)}
              >
                {t === 0 ? "On receipt" : `Net ${t}`}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={showOther}
              onClick={() => setOtherOpen(true)}
              className={chip(showOther)}
            >
              Other…
            </button>
            {showOther && (
              <span className="flex items-center gap-2 text-sm">
                <Input
                  id="net"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={365}
                  value={netDays}
                  onChange={(e) => onNetDays(e.target.value)}
                  className="h-9 w-20 text-center font-mono"
                  aria-label="Payment due in (days)"
                />
                days
              </span>
            )}
          </fieldset>
        </div>
      </FormStep>

      <FormStep n={4} title="Anything to add?">
        <div className="grid gap-1.5">
          <Label htmlFor="notes">Notes / payment terms</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="e.g. Thanks for a great month!"
          />
        </div>
        <details ref={moreRef}>
          <summary className="cursor-pointer font-medium text-sm">
            More options
            {number && <span className="ml-2 font-mono font-normal text-muted-foreground text-xs">{number}</span>}
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor="number">Invoice number</Label>
              <Input
                id="number"
                value={number}
                onChange={(e) => onNumber(e.target.value)}
                // A cleared number blocks the form: open "More options" so the browser can point at it.
                onInvalid={() => {
                  if (moreRef.current) moreRef.current.open = true;
                }}
                required
                maxLength={40}
                className="font-mono"
              />
            </div>
            <label className="flex min-h-8 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeDetail}
                onChange={(e) => onIncludeDetail(e.target.checked)}
                className="size-4"
              />
              Add a day-by-day list of the time
            </label>
            <label className="flex min-h-8 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={compactNotes}
                onChange={(e) => onCompactNotes(e.target.checked)}
                className="size-4"
              />
              Shorten descriptions in the summary (the full text stays in the day-by-day list)
            </label>
          </div>
        </details>
      </FormStep>
    </div>
  );
}
