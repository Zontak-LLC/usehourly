"use client";

import { useEffect, useRef, useState } from "react";

import { useStopTimer } from "@/components/timer-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRunningMinutes } from "@/components/use-running-minutes";
import { formatDuration } from "@/lib/duration";

/** The running entry on this invoice's time, as it was when Preview invoice was pressed. */
export type RunningChoice = {
  entry: { minutes: number; started_at: Date | string | null; project: { name: string } };
  /** Nothing else to bill: the invoice is this timer or nothing. */
  onlyTime: boolean;
};

const BIG = "h-auto min-h-12 w-full whitespace-normal text-base";

/**
 * Preview invoice pressed while a timer runs on this invoice's time (issue 431, snag 3): stop it and bill it, or leave
 * it running and bill the rest. The preview opens only after the stop has saved the time, so the server bills it from
 * the database. Escape or × closes with nothing changed.
 */
export function RunningTimerDialog({
  choice,
  onClose,
  onContinue,
}: {
  choice: RunningChoice | null;
  onClose: () => void;
  /** Opens the invoice's preview; true once it is open (the page then closes this dialog). */
  onContinue: () => Promise<boolean>;
}) {
  const { stopTimer } = useStopTimer();
  const [working, setWorking] = useState<"stopping" | "opening" | "opening-only" | null>(null);
  // A ref, not only state: a double tap on a phone lands before the state re-renders.
  const busy = useRef(false);
  const ranMinutes = useRunningMinutes(choice?.entry.started_at) + (choice?.entry.minutes ?? 0);
  const underAMinute = ranMinutes < 1;

  async function run(first: "stopping" | "opening-only") {
    if (busy.current) return;
    busy.current = true;
    setWorking(first);
    let opened = false;
    try {
      if (first === "stopping") {
        const stopped = await stopTimer();
        if (!stopped) return; // the toast says why; nothing is invoiced
        setWorking("opening");
      }
      opened = await onContinue();
    } finally {
      // Open: the buttons stay locked until the page closes this dialog (below), so a double tap opens it once.
      if (!opened) {
        busy.current = false;
        setWorking(null);
      }
    }
  }

  // Closed (the preview opened, or Escape): ready for the next press of Preview invoice.
  useEffect(() => {
    if (choice) return;
    busy.current = false;
    setWorking(null);
  }, [choice]);

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
                  busy={working === "stopping" || working === "opening"}
                  busyLabel={working === "stopping" ? "Stopping" : "Opening the preview"}
                  onClick={() => void run("stopping")}
                >
                  {working === "stopping"
                    ? "Stopping…"
                    : working === "opening"
                      ? "Opening the preview…"
                      : "Stop it and include it"}
                </Button>
                {!choice.onlyTime && (
                  <Button
                    type="button"
                    variant="outline"
                    className={BIG}
                    disabled={working !== null}
                    busy={working === "opening-only"}
                    busyLabel="Opening the preview"
                    onClick={() => void run("opening-only")}
                  >
                    {working === "opening-only" ? "Opening the preview…" : "Leave it running and invoice without it"}
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
