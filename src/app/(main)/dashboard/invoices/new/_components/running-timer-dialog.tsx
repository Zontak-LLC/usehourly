"use client";

import { useRef, useState } from "react";

import { useStopTimer } from "@/components/timer-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRunningMinutes } from "@/components/use-running-minutes";
import { formatDuration } from "@/lib/duration";

/** The running entry on this invoice's time, as it was when Create invoice was pressed. */
export type RunningChoice = {
  entry: { minutes: number; started_at: Date | string | null; project: { name: string } };
  /** Nothing else to bill: the invoice is this timer or nothing. */
  onlyTime: boolean;
};

const BIG = "h-auto min-h-12 w-full whitespace-normal text-base";

/**
 * Create invoice pressed while a timer runs on this invoice's time (issue 431, snag 3): stop it and bill it, or leave it
 * running and bill the rest. The invoice is made only after the stop has saved the time, so the server bills it from the
 * database. Escape or × closes with nothing changed.
 */
export function RunningTimerDialog({
  choice,
  onClose,
  createInvoice,
}: {
  choice: RunningChoice | null;
  onClose: () => void;
  /** Makes the invoice; true once it is made (the page then leaves). */
  createInvoice: () => Promise<boolean>;
}) {
  const { stopTimer } = useStopTimer();
  const [working, setWorking] = useState<"stopping" | "creating" | "creating-only" | null>(null);
  // A ref, not only state: a double tap on a phone lands before the state re-renders.
  const busy = useRef(false);
  const ranMinutes = useRunningMinutes(choice?.entry.started_at) + (choice?.entry.minutes ?? 0);
  const underAMinute = ranMinutes < 1;

  async function run(first: "stopping" | "creating-only") {
    if (busy.current) return;
    busy.current = true;
    setWorking(first);
    let made = false;
    try {
      if (first === "stopping") {
        const stopped = await stopTimer();
        if (!stopped) return; // the toast says why; nothing is invoiced
        setWorking("creating");
      }
      made = await createInvoice();
    } finally {
      // Made: the page is leaving, so the buttons stay locked against a second invoice.
      if (!made) {
        busy.current = false;
        setWorking(null);
      }
    }
  }

  const line = !choice?.onlyTime
    ? "Stop it to bill its time now, or leave it running and bill the rest."
    : underAMinute
      ? "This timer has run less than a minute. Nothing to bill yet."
      : "This timer is the only time to bill so far.";

  return (
    <Dialog open={choice !== null} onOpenChange={(open) => !open && !busy.current && onClose()}>
      {choice && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="pr-8 leading-snug">
              A timer is running ({formatDuration(ranMinutes)} on {choice.entry.project.name})
            </DialogTitle>
            <DialogDescription>{line}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {choice.onlyTime && underAMinute ? (
              <Button type="button" variant="primary" className={BIG} onClick={onClose}>
                Keep it running
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="primary"
                  className={BIG}
                  disabled={working !== null}
                  busy={working === "stopping" || working === "creating"}
                  busyLabel={working === "stopping" ? "Stopping" : "Creating"}
                  onClick={() => void run("stopping")}
                >
                  {working === "stopping"
                    ? "Stopping…"
                    : working === "creating"
                      ? "Creating…"
                      : "Stop it and include it"}
                </Button>
                {!choice.onlyTime && (
                  <Button
                    type="button"
                    variant="outline"
                    className={BIG}
                    disabled={working !== null}
                    busy={working === "creating-only"}
                    busyLabel="Creating"
                    onClick={() => void run("creating-only")}
                  >
                    {working === "creating-only" ? "Creating…" : "Leave it running and invoice without it"}
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
