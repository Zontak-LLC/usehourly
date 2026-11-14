"use client";

import { useEffect, useState } from "react";

import { toISODate } from "@/lib/dates";
import { watchLocalDate } from "@/lib/local-date-watch";

/**
 * Today's date as YYYY-MM-DD in the browser's own time zone, or null until the page has loaded in the browser.
 * Workers run in UTC, so "today" is never worked out on the server (see CLAUDE.md); the first render is always null.
 * It follows the real date: a tab left open overnight moves to the new day when it is shown again, gets focus, or
 * passes midnight (issue 449).
 */
export function useToday(): string | null {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(toISODate(new Date()));
    return watchLocalDate(setToday);
  }, []);
  return today;
}
