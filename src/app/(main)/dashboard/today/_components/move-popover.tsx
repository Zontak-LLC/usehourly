"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useOptimisticEntries } from "@/components/use-optimistic-entries";
import { addDays, DATE_RE, fromISODate, startOfWeek } from "@/lib/dates";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

const longDate = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const shortDate = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * Move one entry to another day: quick picks around its current day, or any date in the
 * year via the date field. Only the date changes; hours, note and project stay put.
 * It opens from the entry's "More actions" menu, so it is controlled from outside and hangs under whatever it wraps.
 */
export function MovePopover({
  entryId,
  date,
  open,
  onOpenChange,
  onMoved,
  children,
}: {
  entryId: string;
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoved: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const update = trpc.entry.update.useMutation();
  const optimistic = useOptimisticEntries();
  const setOpen = onOpenChange;
  const [target, setTarget] = useState(date);

  // Relative to the entry's own day, so "next Monday" makes sense from any week.
  const nextMonday = addDays(startOfWeek(date), 7);
  const picks: { label: string; date: string }[] = [
    { label: "Previous day", date: addDays(date, -1) },
    { label: "Next day", date: addDays(date, 1) },
    { label: "Next Monday", date: nextMonday },
    { label: "+1 week", date: addDays(date, 7) },
  ];

  async function move(to: string) {
    if (!DATE_RE.test(to)) return toast.error("Pick a valid date.");
    if (to === date) return setOpen(false);
    // The entry leaves (or changes day in) the lists on screen at once; the server's answer confirms or undoes it.
    const undo = await optimistic.patch(entryId, { date: to });
    setOpen(false);
    try {
      await update.mutateAsync({ id: entryId, date: to });
      await onMoved();
      toast.success(`Moved to ${longDate.format(fromISODate(to))}.`);
    } catch (err) {
      undo();
      toastError(err, "Couldn't move that entry.");
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setTarget(date);
      }}
    >
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent className="w-72 space-y-3" align="end">
        <p className="font-medium text-sm">Move to another day</p>
        <div className="grid grid-cols-2 gap-1.5">
          {picks.map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() => move(p.date)}
              className="h-auto flex-col items-start gap-0 py-2 text-left"
            >
              <span className="text-xs">{p.label}</span>
              <span className="font-normal text-muted-foreground text-xs">{shortDate.format(fromISODate(p.date))}</span>
            </Button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`move-${entryId}`} className="text-muted-foreground text-xs">
            Or pick any date
          </label>
          <div className="flex gap-2">
            <Input
              id={`move-${entryId}`}
              type="date"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && move(target)}
            />
            <Button disabled={update.isPending || !target || target === date} onClick={() => move(target)}>
              {update.isPending ? "Moving…" : "Move"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
