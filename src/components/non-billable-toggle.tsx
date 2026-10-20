"use client";

import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/**
 * A small icon button that marks one day non-billable (or undoes it). The day and its entries stay on screen; invoices,
 * exports and the year summary leave that day's time out so nothing in them can be mistaken for billable work. It sits
 * in the header of whatever shows the day, and its tooltip says what it does. `compact` is 32px, to sit beside the hours
 * chip; the default is 40px, like the other header buttons.
 */
export function NonBillableToggle({
  date,
  compact = false,
  labelled = false,
  seed,
}: {
  date: string;
  compact?: boolean;
  /** Show the words "Non-billable day" beside the icon (the Week page's day card). */
  labelled?: boolean;
  /** The marked days of a longer range already loaded (the week): used instead of asking again for this one day. */
  seed?: { days: string[]; updatedAt: number };
}) {
  const utils = trpc.useUtils();
  const days = trpc.entry.nonBillableDays.useQuery(
    { from: date, to: date },
    seed ? { initialData: seed.days.filter((d) => d === date), initialDataUpdatedAt: seed.updatedAt } : undefined,
  );
  const set = trpc.entry.setNonBillable.useMutation();
  const on = days.data?.includes(date) ?? false;

  async function toggle() {
    try {
      await set.mutateAsync({ date, nonBillable: !on });
      await Promise.all([
        utils.entry.nonBillableDays.invalidate(),
        utils.entry.list.invalidate(),
        utils.project.budgets.invalidate(),
      ]);
    } catch (err) {
      toastError(err, "Couldn't change that day.");
    }
  }

  return (
    <Button
      type="button"
      size={labelled ? "default" : "icon"}
      variant={on ? "default" : "outline"}
      className={labelled ? "h-9" : compact ? "size-8" : "size-10"}
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
      {labelled && "Non-billable day"}
    </Button>
  );
}
