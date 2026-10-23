"use client";

import { useId, useRef, useState } from "react";

import { ArrowRight, Check, LoaderCircle } from "lucide-react";

/** How far (in percent) the knob must be dragged before letting go counts as a yes. */
const COMMIT_AT = 90;
/** One arrow-key press moves the knob this far. */
const STEP = 10;
/** The knob's width in pixels (size-12), used to keep it inside the track. */
const KNOB = 48;

/** Where a key moves the knob from `value` (0 to 100), or null for a key the slider ignores (Enter among them). */
export function slideKey(key: string, value: number): number | null {
  if (key === "ArrowRight" || key === "ArrowUp") return Math.min(100, value + STEP);
  if (key === "ArrowLeft" || key === "ArrowDown") return Math.max(0, value - STEP);
  if (key === "Home") return 0;
  if (key === "End") return 100;
  return null;
}

/**
 * A slide-to-confirm control for actions that cannot be undone (issue #210): drag the knob all the way to the right and
 * let go, and `onConfirm` runs. Let go early and the knob springs back. The track turns red only at the end.
 *
 * Keyboard and screen readers: the knob is a `role="slider"` (0 to 100). Arrow Right / Up moves it on, End jumps to the
 * end and confirms, Arrow Left / Down / Home move it back. Enter does nothing on its own, so a stray Enter in a field
 * never confirms. Leaving the control before the end puts the knob back at the start.
 *
 * Touch: `touch-action: none` and `data-no-swipe`, so a finger drag never scrolls the page or swipes to another tab.
 * Reduced motion: the spring back is instant.
 */
export function SlideToConfirm({
  label,
  hint,
  pendingLabel = "Working…",
  disabled = false,
  pending = false,
  onConfirm,
}: {
  /** The words on the track and the slider's accessible name, e.g. "Slide to delete your account". */
  label: string;
  /** Read out after the name (and shown under the track while disabled), e.g. why it is not available yet. */
  hint?: string;
  pendingLabel?: string;
  disabled?: boolean;
  pending?: boolean;
  /** Runs once the knob reaches the end. When it settles (success or failure), the knob goes back to the start. */
  onConfirm: () => unknown;
}) {
  const [value, setValue] = useState(0);
  const [dragging, setDragging] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const grab = useRef(0);
  const fired = useRef(false);
  const helpId = useId();
  const off = disabled || pending;

  async function confirm() {
    if (fired.current) return;
    fired.current = true;
    setValue(100);
    try {
      await onConfirm();
    } finally {
      fired.current = false;
      setValue(0);
    }
  }

  function percentAt(clientX: number) {
    const box = track.current?.getBoundingClientRect();
    if (!box) return 0;
    const room = Math.max(1, box.width - KNOB - 8);
    return Math.max(0, Math.min(100, ((clientX - box.left - 4 - grab.current) / room) * 100));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (off || e.button !== 0) return;
    const knob = e.currentTarget.getBoundingClientRect();
    grab.current = e.clientX - knob.left;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setValue(percentAt(e.clientX));
  }

  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (value >= COMMIT_AT) void confirm();
    else setValue(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (off) return;
    const next = slideKey(e.key, value);
    if (next === null) return;
    e.preventDefault();
    if (next >= 100) void confirm();
    else setValue(next);
  }

  const atEnd = value >= COMMIT_AT || pending;
  const shown = pending ? 100 : value;
  const springs = !dragging && "motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out";

  return (
    <div className="grid gap-1.5">
      <div
        ref={track}
        data-no-swipe
        className={`relative h-14 touch-none select-none overflow-hidden rounded-full border-2 ${
          atEnd ? "border-destructive" : "border-foreground/20"
        } ${off && !pending ? "opacity-50" : ""} bg-muted`}
      >
        {/* The fill behind the knob: neutral while sliding, red only at the end. */}
        <div
          aria-hidden
          className={`absolute inset-y-0 left-0 rounded-full ${atEnd ? "bg-destructive" : "bg-foreground/10"} ${springs || ""}`}
          style={{ width: `calc(${KNOB + 8}px + (100% - ${KNOB + 8}px) * ${shown / 100})` }}
        />
        <p
          aria-hidden
          className={`pointer-events-none absolute inset-0 grid place-items-center pr-4 pl-16 text-center font-semibold text-sm ${
            atEnd ? "text-white dark:text-background" : "text-foreground/80"
          }`}
        >
          {pending ? pendingLabel : label}
        </p>
        <div
          role="slider"
          tabIndex={off ? -1 : 0}
          aria-label={label}
          aria-describedby={helpId}
          aria-disabled={off || undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(shown)}
          aria-valuetext={
            pending ? pendingLabel : shown >= 100 ? "At the end" : `${Math.round(shown)} percent of the way`
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            setDragging(false);
            setValue(0);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (!fired.current && !pending) setValue(0);
          }}
          className={`absolute top-1 grid size-12 place-items-center rounded-full bg-card shadow-md outline-none ring-1 ring-foreground/15 focus-visible:ring-4 focus-visible:ring-ring/50 ${
            off ? "cursor-not-allowed" : dragging ? "cursor-grabbing" : "cursor-grab"
          } ${atEnd ? "text-destructive" : "text-foreground"} ${springs || ""}`}
          style={{ left: `calc(4px + (100% - ${KNOB + 8}px) * ${shown / 100})` }}
        >
          {pending ? (
            <LoaderCircle aria-hidden className="size-5 motion-safe:animate-spin" />
          ) : atEnd ? (
            <Check aria-hidden className="size-5" strokeWidth={2.5} />
          ) : (
            <ArrowRight aria-hidden className="size-5" strokeWidth={2.5} />
          )}
        </div>
      </div>
      <p id={helpId} className={off && hint ? "text-foreground/70 text-xs" : "sr-only"}>
        {off && hint ? hint : "Drag the handle all the way to the right, or press the End key."}
      </p>
    </div>
  );
}
