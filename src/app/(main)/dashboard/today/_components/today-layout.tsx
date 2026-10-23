"use client";

import type { ReactNode } from "react";

/**
 * How Today is arranged (chosen 2026-10-23, "A · watch beside the work"): the week as one row of day buttons across the
 * top, then from 768px two columns: the watch on the left (it stays in view while the right side scrolls) and the job on
 * the right: the add form, the calendar, the day's entries. On a phone everything is one column in that order.
 */
export function TodayLayout({
  watch,
  pills,
  timerBar,
  form,
  calendarTop,
  entries,
  calendarBottom,
}: {
  watch: ReactNode;
  pills: ReactNode;
  timerBar: ReactNode;
  form: ReactNode;
  calendarTop: ReactNode;
  entries: ReactNode;
  calendarBottom: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {pills}
      <div className="grid items-start gap-4 md:grid-cols-[15rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="md:sticky md:top-24">{watch}</div>
        <div className="flex min-w-0 flex-col gap-4">
          {timerBar}
          {form}
          {calendarTop}
          {entries}
          {calendarBottom}
        </div>
      </div>
    </div>
  );
}
