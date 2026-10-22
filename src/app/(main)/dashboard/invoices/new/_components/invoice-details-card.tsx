"use client";

import { FormStep } from "@/components/form-step";
import { RANGE_INPUT_CLASS } from "@/components/time-ruler";
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
  const days = Math.min(90, Math.max(0, Number.parseInt(netDays, 10) || 0));
  const dueLabel = days === 0 ? "Due on receipt" : `Due ${dueFormat.format(fromISODate(addDays(today, days)))}`;

  return (
    <div className="flex flex-col gap-6 rounded-3xl border bg-card p-4 shadow-[var(--shadow-sheet)] sm:p-5">
      <FormStep n={1} title="Who is it for?">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="client">Client</Label>
            <NativeSelect id="client" value={clientId} onChange={(e) => onClientId(e.target.value)}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="number">Invoice number</Label>
            <Input
              id="number"
              value={number}
              onChange={(e) => onNumber(e.target.value)}
              required
              maxLength={40}
              className="font-mono"
            />
          </div>
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
                className={`rounded-full border px-3 py-1.5 text-sm transition-all motion-safe:active:scale-95 ${
                  on
                    ? "border-amber bg-amber font-semibold text-[#1b1405]"
                    : "bg-muted/50 hover:border-foreground/30 hover:bg-muted"
                }`}
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
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="net">Payment due in (days)</Label>
            <span className="font-display font-extrabold text-amber text-lg">{dueLabel}</span>
          </div>
          {/* The slider moves the same number the box holds: 0 to 90 days in steps of 5, with the usual terms as stops. */}
          <div className="relative h-6">
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber"
                style={{ width: `calc(12px + (100% - 24px) * ${days / 90})` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={days}
              aria-label="Payment due, in days"
              aria-valuetext={`${days} days`}
              onChange={(e) => onNetDays(e.target.value)}
              className={RANGE_INPUT_CLASS}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TERMS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={days === t}
                onClick={() => onNetDays(String(t))}
                className={`rounded-full border px-3 py-1 font-mono text-xs transition-all motion-safe:active:scale-95 ${
                  days === t ? "border-foreground bg-foreground text-background" : "bg-muted/50 hover:bg-muted"
                }`}
              >
                {t === 0 ? "On receipt" : `Net ${t}`}
              </button>
            ))}
            <Input
              id="net"
              type="number"
              inputMode="numeric"
              min={0}
              max={365}
              value={netDays}
              onChange={(e) => onNetDays(e.target.value)}
              className="ml-auto h-9 w-20 text-center font-mono"
              aria-label="Payment due in (days)"
            />
          </div>
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
            placeholder="e.g. Please pay by ACH to … Thank you!"
          />
        </div>
        <details>
          <summary className="cursor-pointer font-medium text-sm">More options</summary>
          <div className="mt-3 flex flex-col gap-2">
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
