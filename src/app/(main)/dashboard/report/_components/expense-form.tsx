"use client";

import { useState } from "react";

import { useMoney } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  type ExpenseDraft,
  type ExpenseFields,
  expenseFields,
  MAX_NOTE,
  mileageCents,
  parseDistance,
  parseMileageRate,
  readExpenseFields,
  SPEND_CATEGORIES,
} from "@/lib/expenses";

/** An expense as the list holds it (what the form starts from when editing). */
export type ExpenseValues = Parameters<typeof expenseFields>[0];

const PILL = "rounded-full border px-3 py-1.5 text-sm";
const PILL_ON = "border-foreground bg-foreground text-background";
const PILL_OFF = "bg-muted/50 hover:bg-muted";

type FieldProps = { f: ExpenseFields; set: (patch: Partial<ExpenseFields>) => void; id: (name: string) => string };

/** Amount and category: a plain expense. */
function SpendFields({ f, set, id }: FieldProps) {
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor={id("amount")}>Amount</Label>
        <Input
          id={id("amount")}
          value={f.amount}
          onChange={(e) => set({ amount: e.target.value })}
          inputMode="decimal"
          placeholder="0.00"
          className="font-mono"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("category")}>Category</Label>
        <NativeSelect id={id("category")} value={f.category} onChange={(e) => set({ category: e.target.value })}>
          {SPEND_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </>
  );
}

/** Distance, unit and rate: a trip. */
function TripFields({ f, set, id }: FieldProps) {
  const per = f.unit === "km" ? "km" : "mile";
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor={id("distance")}>Distance</Label>
        <div className="flex gap-2">
          <Input
            id={id("distance")}
            value={f.distance}
            onChange={(e) => set({ distance: e.target.value })}
            inputMode="decimal"
            placeholder="12.5"
            className="font-mono"
          />
          <NativeSelect
            aria-label="Unit"
            value={f.unit}
            onChange={(e) => set({ unit: e.target.value === "km" ? "km" : "mi" })}
            className="w-24"
          >
            <option value="mi">miles</option>
            <option value="km">km</option>
          </NativeSelect>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("rate")}>Rate per {per}</Label>
        <Input
          id={id("rate")}
          value={f.rate}
          onChange={(e) => set({ rate: e.target.value })}
          inputMode="decimal"
          className="font-mono"
          aria-describedby={id("rate-help")}
        />
        <p id={id("rate-help")} className="text-muted-foreground text-xs">
          Starts at 0.70, the IRS rate for 2025. Change it to the rate for your year or country.
        </p>
      </div>
    </>
  );
}

/** What a trip comes to while it is typed, or null. */
function tripCents(f: ExpenseFields): number | null {
  const d = parseDistance(f.distance);
  const r = parseMileageRate(f.rate);
  return "distance" in d && "rate" in r ? mileageCents(d.distance, r.rate) : null;
}

/**
 * Add or edit one expense, in place (no dialog): Expense (amount and category) or Mileage (distance at a rate per mile
 * or kilometre; the amount is worked out). Delete sits at the bottom left when editing, like an entry's form.
 */
export function ExpenseForm({
  idPrefix,
  initial,
  defaultDate,
  clients,
  pending,
  onSave,
  onCancel,
  onDelete,
}: {
  idPrefix: string;
  initial?: ExpenseValues;
  defaultDate: string;
  clients: { id: string; name: string }[];
  pending: boolean;
  onSave: (draft: ExpenseDraft) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const money = useMoney();
  const [f, setF] = useState(() => expenseFields(initial, defaultDate));
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ExpenseFields>) => setF((old) => ({ ...old, ...patch }));
  const id = (name: string) => `${idPrefix}-${name}`;
  const cents = f.kind === "mileage" ? tripCents(f) : null;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const read = readExpenseFields(f);
    if ("error" in read) {
      setError(read.error);
      return;
    }
    setError(null);
    onSave(read.draft);
  }

  return (
    <form
      method="post"
      onSubmit={submit}
      aria-label={initial ? "Edit expense" : "Add an expense"}
      className="grid gap-4"
    >
      <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-2">
        {(["expense", "mileage"] as const).map((k) => (
          // biome-ignore lint/a11y/useSemanticElements: a pill that acts as a radio, like the other pill choices
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={f.kind === k}
            onClick={() => set({ kind: k })}
            className={`${PILL} ${f.kind === k ? PILL_ON : PILL_OFF}`}
          >
            {k === "expense" ? "Expense" : "Mileage"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id("date")}>Date</Label>
          <Input id={id("date")} type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} required />
        </div>
        {f.kind === "expense" ? <SpendFields f={f} set={set} id={id} /> : <TripFields f={f} set={set} id={id} />}
        <div className="grid gap-1.5">
          <Label htmlFor={id("client")}>Client (optional)</Label>
          <NativeSelect id={id("client")} value={f.clientId} onChange={(e) => set({ clientId: e.target.value })}>
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={id("note")}>Note</Label>
        <Input
          id={id("note")}
          value={f.note}
          onChange={(e) => set({ note: e.target.value })}
          maxLength={MAX_NOTE}
          placeholder={f.kind === "mileage" ? "Office to client site and back" : "Design app, yearly plan"}
        />
      </div>

      {cents !== null && (
        <p className="text-muted-foreground text-sm">
          This trip comes to <strong className="text-foreground">{money(cents)}</strong>.
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {onDelete && (
          <Button type="button" variant="ghost" className="mr-auto h-10 text-destructive" onClick={onDelete}>
            Delete
          </Button>
        )}
        <Button type="button" variant="outline" className="h-10" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="h-10 px-5" disabled={pending}>
          {initial ? "Save expense" : "Add expense"}
        </Button>
      </div>
    </form>
  );
}
