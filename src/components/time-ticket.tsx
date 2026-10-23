"use client";

import { useRef } from "react";

import { Check, RotateCcw, Trash2 } from "lucide-react";

import { MAX_MINUTES, MIN_MINUTES, NUDGE, type TodayTimer } from "@/components/timer-control";
import { formatDuration } from "@/lib/duration";

const dayLine = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fly the ticket into Today's timesheet: a copy of it travels to the entry's row and fades into it, and the row glows
 * once so the eye follows. Without the row on screen (or with reduced motion) it simply does nothing.
 */
function flyToEntry(ticket: HTMLElement, entryId: string) {
  const target = document.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(entryId)}"]`);
  if (!target || reduceMotion()) return;
  const from = ticket.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const ghost = ticket.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: "0",
    zIndex: "60",
    pointerEvents: "none",
    transformOrigin: "top left",
  });
  ghost.removeAttribute("id");
  ghost.setAttribute("aria-hidden", "true");
  document.body.appendChild(ghost);
  const dx = to.left - from.left;
  const dy = to.top - from.top;
  const sx = to.width / from.width;
  const sy = Math.max(0.2, to.height / from.height);
  const flight = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1) rotate(-1.5deg)", opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 40}px) scale(${(1 + sx) / 2}) rotate(2deg)`, opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(0deg)`, opacity: 0.2 },
    ],
    { duration: 650, easing: "cubic-bezier(.5,0,.3,1)" },
  );
  flight.onfinish = () => {
    ghost.remove();
    target.animate(
      [{ backgroundColor: "color-mix(in oklab, var(--amber) 28%, transparent)" }, { backgroundColor: "transparent" }],
      { duration: 1400, easing: "ease-out" },
    );
  };
}

/**
 * After Stop, the stopwatch hands you a time ticket (2026-10-23): a slip of paper that slides out under the display and
 * shows exactly the entry it becomes (project and client, what you worked on, the day, the time with − / + to correct
 * it). "Add to timesheet" files it: the ticket flies into Today's timesheet and lands as the new row. Discard drops it,
 * Resume slides it back and the stopwatch carries on.
 */
export function TimeTicket({ timer }: { timer: TodayTimer }) {
  const ref = useRef<HTMLFieldSetElement>(null);
  const s = timer.stopped;
  if (!s) return null;
  const minutes = s.minutes;

  function leave(keyframes: Keyframe[], then: () => void) {
    const el = ref.current;
    if (!el || reduceMotion()) return then();
    el.animate(keyframes, { duration: 260, easing: "ease-in", fill: "forwards" }).onfinish = then;
  }

  return (
    <fieldset
      ref={ref}
      className="w-full min-w-0 max-w-[17rem] motion-safe:animate-[ticket-print_.45s_cubic-bezier(.2,.9,.3,1)]"
    >
      <legend className="sr-only">Time ticket: add this time to your timesheet, resume the timer or discard it</legend>
      <div className="relative -rotate-[1.5deg] rounded-md bg-[rgb(250_249_246)] px-4 pt-3 pb-4 text-[rgb(20_22_27)] shadow-[0_16px_30px_-14px_rgb(0_0_0/0.7)] dark:brightness-[0.9]">
        {/* The torn top edge, as if it came out of the stopwatch. */}
        <span
          aria-hidden
          className="absolute inset-x-0 -top-1 h-2"
          style={{
            background:
              "radial-gradient(circle at 4px 0, transparent 3px, rgb(250 249 246) 3.5px) 0 0 / 8px 8px repeat-x",
          }}
        />
        <div className="flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.25em] opacity-60">
          <span>Time ticket</span>
          <span>{dayLine.format(new Date())}</span>
        </div>
        <p className="mt-2 truncate font-semibold text-sm">{s.where}</p>
        <p className="truncate text-[rgb(20_22_27/0.65)] text-xs">{s.note?.trim() || "No description"}</p>

        <div className="mt-3 flex items-center justify-between border-[rgb(20_22_27/0.15)] border-y border-dashed py-2">
          <button
            type="button"
            aria-label="Take off 5 min"
            disabled={minutes <= MIN_MINUTES}
            onClick={() => timer.onNudge(-NUDGE)}
            className="grid size-9 place-items-center rounded-full text-lg ring-1 ring-[rgb(20_22_27/0.2)] hover:bg-[rgb(20_22_27/0.06)] disabled:opacity-40"
          >
            −
          </button>
          <span className="font-mono font-semibold text-3xl tabular-nums tracking-tight">
            {formatDuration(minutes)}
          </span>
          <button
            type="button"
            aria-label="Add 5 min"
            disabled={minutes >= MAX_MINUTES}
            onClick={() => timer.onNudge(NUDGE)}
            className="grid size-9 place-items-center rounded-full text-lg ring-1 ring-[rgb(20_22_27/0.2)] hover:bg-[rgb(20_22_27/0.06)] disabled:opacity-40"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (ref.current) flyToEntry(ref.current, s.id);
            timer.onKeep();
          }}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[rgb(20_22_27)] font-semibold text-[rgb(250_249_246)] text-sm transition-transform active:translate-y-px"
        >
          <Check className="size-4" aria-hidden /> Add to timesheet
        </button>
        <div className="mt-2 flex justify-between text-xs">
          <button
            type="button"
            onClick={() =>
              leave(
                [{ transform: "translateY(0)" }, { transform: "translateY(-24px)", opacity: 0 }],
                () => void timer.onResume(),
              )
            }
            disabled={timer.resuming}
            className="inline-flex min-h-9 items-center gap-1.5 px-1 opacity-70 hover:opacity-100"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Resume timer
          </button>
          <button
            type="button"
            onClick={() =>
              leave(
                [{ transform: "translateY(0) rotate(0)" }, { transform: "translateY(30px) rotate(6deg)", opacity: 0 }],
                () => void timer.onDiscard(),
              )
            }
            disabled={timer.discarding}
            className="inline-flex min-h-9 items-center gap-1.5 px-1 text-[rgb(176_32_40)] opacity-80 hover:opacity-100"
          >
            <Trash2 className="size-3.5" aria-hidden /> Discard time
          </button>
        </div>
      </div>
    </fieldset>
  );
}
