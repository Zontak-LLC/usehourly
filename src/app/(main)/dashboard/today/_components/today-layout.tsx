"use client";

import type { ReactNode } from "react";

/**
 * How Today is arranged: the week as one row of day buttons across the top, then one column: the timer strip, the add
 * form, the calendar, the day's entries. (2026-10-23: the big watch on the left was removed; most people log after the
 * fact, and the timer is now a slim strip, so the form and the timesheet take the full width.)
 */
export function TodayLayout({
  pills,
  timerBar,
  form,
  calendarTop,
  entries,
  calendarBottom,
}: {
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
      {timerBar}
      {form}
      {calendarTop}
      {entries}
      {calendarBottom}
    </div>
  );
}
