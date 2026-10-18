import { useEffect, useRef, useState } from "react";

import { rectDays } from "@/lib/grid-select";

// Mouse drag-select: a rectangle of cells (row/column in the grid), like a spreadsheet.
export type Drag = {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
  additive: boolean;
  base: Set<string>;
  moved: boolean;
};

/**
 * The days picked in quick-add mode, by click or by dragging a rectangle across the calendar.
 * `first` identifies the month: a different month starts a fresh selection.
 */
export function useDaySelection(first: string | null, setSelectMode: (on: boolean) => void) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const commitDrag = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const up = () => commitDrag.current?.();
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [dragging]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a different month starts a fresh selection
  useEffect(() => setPicked(new Set()), [first]);

  /**
   * The dragged rectangle's in-month days; while dragging it replaces (or, with Ctrl/⌘, extends)
   * the committed selection, so the highlight is live. Also arms the pointer-up commit.
   */
  function resolve(weeks: string[][], inMonth: (d: string) => boolean): Set<string> {
    let shownPicked = picked;
    if (drag?.moved) {
      const rect = rectDays(weeks, drag, inMonth);
      shownPicked = drag.additive ? new Set([...drag.base, ...rect]) : rect;
    }
    commitDrag.current = () => {
      if (drag?.moved) {
        suppressClick.current = true; // the click that follows a drag must not toggle/open
        setSelectMode(true);
        setPicked(shownPicked);
      }
      setDrag(null);
    };
    return shownPicked;
  }

  return { picked, setPicked, drag, setDrag, suppressClick, resolve };
}

export type DaySelection = ReturnType<typeof useDaySelection>;
