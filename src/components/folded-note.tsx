"use client";

import { useEffect, useRef, useState } from "react";

import { NOTE_PREVIEW_LINES } from "@/lib/notes";

/**
 * A description folded to two lines. It reports whether the text really is cut off at the current width, so the
 * "Show more" link appears only when there is something more to show (a long note on a wide screen may fit).
 */
export function NoteText({
  note,
  expanded,
  onClipped,
  className = "mt-0.5 block whitespace-pre-wrap break-words text-muted-foreground text-sm",
}: {
  note: string;
  expanded: boolean;
  onClipped: (clipped: boolean) => void;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again whenever the text or the fold changes
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => onClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [note, expanded]);
  return (
    <span
      ref={ref}
      className={className}
      style={
        expanded
          ? undefined
          : {
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: NOTE_PREVIEW_LINES,
              overflow: "hidden",
            }
      }
    >
      {note}
    </span>
  );
}

/** A description folded to two lines with its own Show more / Show less link (the link appears only when text is cut off). */
export function FoldedNote({ note }: { note: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  return (
    <>
      <NoteText
        note={note}
        expanded={expanded}
        onClipped={setClipped}
        className="block whitespace-pre-wrap break-words text-sm"
      />
      {(clipped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 min-h-6 text-foreground/75 text-xs underline underline-offset-2 hover:text-foreground"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}
