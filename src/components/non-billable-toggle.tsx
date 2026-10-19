"use client";

import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/**
 * A small icon button that marks one day non-billable (or undoes it). The day and its entries stay on screen; invoices,
 * exports and the year summary leave that day's time out so nothing in them can be mistaken for billable work. It sits
 * in the header of whatever shows the day, and its tooltip says what it does. `bare` drops the button frame: just the
 * icon (tinted when the day is marked), for a row that is already crowded.
 */
export function NonBillableToggle({ date, bare = false }: { date: string; bare?: boolean }) {
  const utils = trpc.useUtils();
  const days = trpc.entry.nonBillableDays.useQuery({ from: date, to: date });
  const set = trpc.entry.setNonBillable.useMutation();
  const on = days.data?.includes(date) ?? false;

  async function toggle() {
    try {
      await set.mutateAsync({ date, nonBillable: !on });
      await Promise.all([utils.entry.nonBillableDays.invalidate(), utils.entry.list.invalidate()]);
    } catch (err) {
      toastError(err, "Couldn't change that day.");
    }
  }

  return (
    <Button
      type="button"
      size="icon"
      variant={bare ? "ghost" : on ? "default" : "outline"}
      className={bare ? `size-8 ${on ? "bg-rose-600/15 hover:bg-rose-600/25" : ""}` : "size-10"}
      aria-pressed={on}
      aria-label={on ? "Non-billable day (click to undo)" : "Mark day non-billable"}
      title={
        on
          ? "Non-billable day: left out of invoices, exports and the year summary. Click to undo."
          : "Mark this day non-billable: leaves it out of invoices, exports and the year summary."
      }
      disabled={set.isPending || days.isLoading}
      onClick={toggle}
    >
      <Ban />
    </Button>
  );
}
