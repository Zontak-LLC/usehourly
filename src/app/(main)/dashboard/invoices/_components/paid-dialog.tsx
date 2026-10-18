"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Mark an invoice paid on a date (defaults to today), change that date, or mark it unpaid. */
export function PaidDialog({
  invoice,
  today,
  onSave,
  onClose,
  busy,
}: {
  invoice: { number: string; paid_date: string | null } | null;
  today: string;
  onSave: (date: string | null) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [date, setDate] = useState(today);
  useEffect(() => {
    if (invoice) setDate(invoice.paid_date ?? today);
  }, [invoice, today]);

  async function save(next: string | null) {
    await onSave(next);
    onClose();
  }

  return (
    <Dialog open={invoice !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {invoice?.paid_date ? "Payment received" : "Mark as paid"} · {invoice?.number}
          </DialogTitle>
          <DialogDescription>When did the money arrive? It counts toward that year's income.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="paid-date">Date the money arrived</Label>
          <Input id="paid-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          {invoice?.paid_date ? (
            <Button variant="ghost" disabled={busy} onClick={() => save(null)}>
              Mark unpaid
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={busy || !date} onClick={() => save(date)}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
