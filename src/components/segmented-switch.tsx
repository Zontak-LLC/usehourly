"use client";

/** The grey track a row of segmented pills sits on (docs/ui-spec.md, "Segmented filters"). */
export const SEGMENT_TRACK = "m-0 flex gap-1 rounded-full border-0 bg-muted p-1";

/** One pill of a segmented filter: the chosen one is a raised WHITE pill, never solid ink or the accent. */
export function segmentClass(on: boolean): string {
  return `inline-flex min-h-11 items-center justify-center rounded-full px-4 font-medium text-sm transition-colors sm:min-h-9 ${
    on
      ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10 dark:bg-foreground/15"
      : "text-foreground/75 hover:text-foreground"
  }`;
}

/**
 * A choice between two or three views of the same thing (Month: Day | Whole month; the entries list: By day | By
 * project). Buttons with `aria-pressed`, so a screen reader hears which one is on.
 */
export function SegmentedSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
  className = "",
}: {
  /** The group's name for a screen reader ("Show", "Group the list"). */
  label: string;
  options: readonly (readonly [id: T, label: string])[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset aria-label={label} className={`${SEGMENT_TRACK} ${className}`}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`${segmentClass(value === id)} flex-1 sm:flex-none`}
        >
          {text}
        </button>
      ))}
    </fieldset>
  );
}
