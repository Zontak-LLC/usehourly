"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

export function InvoiceDetailsCard({
  clients,
  values,
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

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <h2 className="border-b bg-muted/40 px-4 py-3 font-semibold text-base">Invoice details</h2>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="client">Client</Label>
          <select
            id="client"
            value={clientId}
            onChange={(e) => onClientId(e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="number">Invoice number</Label>
          <Input id="number" value={number} onChange={(e) => onNumber(e.target.value)} required maxLength={40} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => onFrom(e.target.value)} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => onTo(e.target.value)} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="net">Payment due in (days)</Label>
          <Input id="net" type="number" min={0} max={365} value={netDays} onChange={(e) => onNetDays(e.target.value)} />
        </div>
        <details className="rounded-lg border px-3 py-2 sm:col-span-2">
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
        <div className="grid gap-1.5 sm:col-span-2">
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
      </div>
    </div>
  );
}
