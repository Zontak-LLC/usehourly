"use client";

import { useState } from "react";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Mark an invoice paid on a date (defaults to today), change that date, or mark it unpaid. Opens inside the invoice's
 * own card (not in a popup); the card owns whether it is open.
 */
export function PaidPanel({
  invoice,
  today,
  onSave,
  onClose,
  busy,
}: {
  invoice: { number: string; paid_date: string | null };
  today: string;
  onSave: (date: string | null) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [date, setDate] = useState(invoice.paid_date ?? today);

  async function save(next: string | null) {
    await onSave(next);
    onClose();
  }

  return (
    <section
      aria-label={`${invoice.paid_date ? "Payment received" : "Mark as paid"} ${invoice.number}`}
      className="flex flex-col gap-3 border-t bg-band-3 px-4 py-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-base">{invoice.paid_date ? "Payment received" : "Mark as paid"}</h3>
          <p className="text-foreground/75 text-sm">When did the money arrive? It counts toward that year's income.</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-10 shrink-0"
          onClick={onClose}
          aria-label="Close"
        >
          <X />
        </Button>
      </div>
      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor={`paid-date-${invoice.number}`}>Date the money arrived</Label>
        <Input id={`paid-date-${invoice.number}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy || !date} onClick={() => save(date)}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {invoice.paid_date && (
          <Button variant="ghost" disabled={busy} onClick={() => save(null)}>
            Mark unpaid
          </Button>
        )}
      </div>
    </section>
  );
}
