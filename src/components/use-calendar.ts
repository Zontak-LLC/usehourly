"use client";

import { useCallback, useEffect, useState } from "react";

import { useCurrentUserId } from "@/components/offline-guard";
import { CalendarFileError, readCalendar } from "@/lib/calendar-events";
import {
  addSkipped,
  CALENDAR_EVENT,
  forgetCalendar,
  keepWindow,
  loadCalendar,
  loadSkipped,
  type SavedCalendar,
  saveCalendar,
} from "@/lib/calendar-store";

/** Files over this are refused before reading (a calendar of many years is a few MB). */
const MAX_FILE_BYTES = 15 * 1024 * 1024;

const storage = () => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** The calendar this account imported (this browser only), the meetings skipped, and how to import, skip and remove. */
export function useSavedCalendar() {
  const userId = useCurrentUserId();
  const [calendar, setCalendar] = useState<SavedCalendar | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setCalendar(loadCalendar(storage(), userId));
    setSkipped(loadSkipped(storage(), userId));
  }, [userId]);
  useEffect(() => {
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(CALENDAR_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(CALENDAR_EVENT, refresh);
    };
  }, [refresh]);

  /** Reads a calendar file in the browser and keeps its recent meetings. Throws a plain-words Error when it cannot. */
  async function importFile(file: File, selfEmail?: string | null) {
    if (!userId) throw new Error("Sign in again to use your calendar.");
    if (file.size > MAX_FILE_BYTES) throw new Error("That file is too big. Export a shorter range from your calendar.");
    setBusy(true);
    try {
      const { events, truncated } = await readCalendar(await file.text(), keepWindow(new Date()), {
        selfEmails: selfEmail ? [selfEmail] : [],
      });
      const ok = saveCalendar(storage(), userId, { name: file.name, events, importedAt: Date.now() });
      if (!ok) throw new Error("Couldn't keep that calendar on this device. Try a shorter range.");
      window.dispatchEvent(new Event(CALENDAR_EVENT));
      return { count: events.length, truncated };
    } catch (err) {
      if (err instanceof CalendarFileError || err instanceof Error) throw err;
      throw new Error("Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  return {
    calendar,
    skipped,
    busy,
    importFile,
    skip: (id: string) => {
      if (userId) addSkipped(storage(), userId, id);
      window.dispatchEvent(new Event(CALENDAR_EVENT));
    },
    remove: () => {
      forgetCalendar(storage());
      window.dispatchEvent(new Event(CALENDAR_EVENT));
    },
  };
}
