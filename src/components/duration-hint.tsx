import { formatDuration } from "@/lib/duration";
import type { TypedDuration } from "@/lib/typed-duration";

/** The id a time box points its `aria-describedby` at, so a screen reader reads the hint with the box. */
export function durationHintId(boxId: string): string {
  return `${boxId}-hint`;
}

/**
 * The line under a typed time box: "= 2:00" while the text can be logged, the plain reason in the destructive colour
 * while it cannot, or `empty` (or nothing) for an empty box. It is drawn from the current text, so the next keystroke
 * replaces or clears it. `shownMinutes` is a rolling figure to show instead of the read minutes; `after` follows the
 * preview ("= 2:00 · Day total 1:00 → 3:00 h").
 */
export function DurationHint(props: {
  boxId: string;
  read: TypedDuration;
  shownMinutes?: number;
  after?: string;
  empty?: string;
  className?: string;
}) {
  const { read } = props;
  const preview = read.minutes === undefined ? "" : `= ${formatDuration(props.shownMinutes ?? read.minutes)}`;
  const text = read.error ?? (preview ? [preview, props.after].filter(Boolean).join(" · ") : props.empty);
  if (!text) return null;
  const colour = read.error ? "text-destructive" : "text-muted-foreground";
  return (
    <p id={durationHintId(props.boxId)} className={`text-xs ${colour} ${props.className ?? ""}`} aria-live="polite">
      {text}
    </p>
  );
}
