import { toISODate } from "@/lib/dates";

/** Where the watch listens: the window (focus) and the document (visibilitychange). Tests pass plain EventTargets. */
export type DateWatchTargets = { win: EventTarget; doc: EventTarget & { visibilityState: string } };

/** Milliseconds from `now` to the next local midnight (worked out in local time, so 23- and 25-hour days are right). */
export function msUntilNextLocalMidnight(now: Date): number {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return nextMidnight.getTime() - now.getTime();
}

/**
 * Calls `onChange` with today's local date when the tab becomes visible, the window gets focus, or local midnight
 * passes. A laptop that slept overnight wakes with a delayed timer, so the visibility and focus events are the main
 * fix; the midnight timeout covers a tab that stays open and awake (issue 449). Returns a cleanup function.
 */
export function watchLocalDate(onChange: (today: string) => void, targets?: DateWatchTargets): () => void {
  // Read here, never at import time, so the module loads in node.
  const { win, doc } = targets ?? { win: window, doc: document };
  const report = () => onChange(toISODate(new Date()));
  const onVisibility = () => {
    if (doc.visibilityState === "visible") report();
  };
  let timeout: ReturnType<typeof setTimeout>;
  // One second past midnight, so the clock is surely on the new day when it fires.
  const scheduleMidnight = () => {
    timeout = setTimeout(() => {
      report();
      scheduleMidnight();
    }, msUntilNextLocalMidnight(new Date()) + 1000);
  };

  doc.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("focus", report);
  scheduleMidnight();
  return () => {
    doc.removeEventListener("visibilitychange", onVisibility);
    win.removeEventListener("focus", report);
    clearTimeout(timeout);
  };
}
