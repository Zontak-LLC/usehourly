"use client";

import type { ReactNode } from "react";

/**
 * How Today is arranged: the day card across the top, then one column: (on another day) a running timer's bar, the
 * Log time card (which holds today's timer since issue 218), the calendar, the day's entries.
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
