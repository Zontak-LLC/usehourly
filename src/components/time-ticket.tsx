"use client";

import { CircleCheck, RotateCcw, Undo2 } from "lucide-react";

import { MAX_MINUTES, MIN_MINUTES, NUDGE, type TodayTimer } from "@/components/timer-control";
import { formatDuration } from "@/lib/duration";

const NUDGE_BUTTON =
  "grid size-9 place-items-center rounded-full text-lg ring-1 ring-foreground/20 hover:bg-muted disabled:opacity-40";
const LINK_BUTTON = "inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-sm hover:bg-muted";
/** A quiet toy to rest the eyes after a block of work (Denis's pond on zontak-1, 2026-10-29). Opens in a new tab. */
export const POND_URL = "https://pond.zontakllc.com";

/**
 * After Stop (issue 218, 2026-10-23): the time is ALREADY an entry in the timesheet, so the strip says so ("Saved 0:42") instead
 * of asking to "Add to timesheet". Beside it: - / + 5 min to correct it, Undo (the entry goes away, as if the timer never
 * ran), Resume (the stopwatch carries on with the same entry) and Done (the strip goes back to Start timer). Under them, one
 * small line offers a pause: the pond, in a new tab so the work stays open.
 */
export function TimeTicket({ timer }: { timer: TodayTimer }) {
  const s = timer.stopped;
  if (!s) return null;
  const minutes = s.minutes;

  return (
    <fieldset className="m-0 w-full min-w-0 border-0 p-0">
      <legend className="sr-only">Saved time: correct it, undo it or resume the timer</legend>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex min-w-0 flex-1 basis-48 items-center gap-2" aria-live="polite">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="font-semibold">Saved {formatDuration(minutes)}</span>
            <span className="text-muted-foreground"> · {s.where}</span>
          </span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Take off 5 min"
            disabled={minutes <= MIN_MINUTES}
            onClick={() => timer.onNudge(-NUDGE)}
            className={NUDGE_BUTTON}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Add 5 min"
            disabled={minutes >= MAX_MINUTES}
            onClick={() => timer.onNudge(NUDGE)}
            className={NUDGE_BUTTON}
          >
            +
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
        <button
          type="button"
          onClick={() => void timer.onDiscard()}
          disabled={timer.discarding}
          className={LINK_BUTTON}
        >
          <Undo2 className="size-3.5" aria-hidden /> Undo
        </button>
        <button type="button" onClick={() => void timer.onResume()} disabled={timer.resuming} className={LINK_BUTTON}>
          <RotateCcw className="size-3.5" aria-hidden /> Resume timer
        </button>
        <button type="button" onClick={() => timer.onKeep()} className={`${LINK_BUTTON} ml-auto font-semibold`}>
          Done
        </button>
      </div>
      <p className="mt-1 px-2 text-muted-foreground text-xs">
        Need a pause?{" "}
        <a
          href={POND_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center underline-offset-4 hover:text-foreground hover:underline"
        >
          🌙 Visit the pond
        </a>
      </p>
    </fieldset>
  );
}
