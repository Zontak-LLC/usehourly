"use client";

import { useCallback, useEffect, useState } from "react";

import { useCurrentUserId } from "@/components/offline-guard";
import { CalendarFileError, readCalendar } from "@/lib/calendar-events";
import { checkCalendarLink, describeCalendarLink } from "@/lib/calendar-link";
import {
  addSkipped,
  CALENDAR_EVENT,
  calendarGeneration,
  cancelCalendarReads,
  forgetCalendar,
  keepWindow,
  loadCalendar,
  loadLink,
  loadSkipped,
  type SavedCalendar,
  saveCalendar,
  saveLink,
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
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setCalendar(loadCalendar(storage(), userId));
    setSkipped(loadSkipped(storage(), userId));
    setLink(loadLink(storage(), userId));
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
      cancelCalendarReads(); // a connected address still being read must not overwrite this file
      const ok = saveCalendar(storage(), userId, { name: file.name, events, importedAt: Date.now() });
      if (!ok) throw new Error("Couldn't keep that calendar on this device. Try a shorter range.");
      saveLink(storage(), userId, null); // a file replaces a connected address
      window.dispatchEvent(new Event(CALENDAR_EVENT));
      return { count: events.length, truncated };
    } catch (err) {
      if (err instanceof CalendarFileError || err instanceof Error) throw err;
      throw new Error("Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Reads the calendar at a private address (through the server, which only passes the text along) and keeps its recent
   * meetings. With no address given, re-reads the one already connected. Throws a plain-words Error when it cannot, and
   * returns null (having saved nothing) when the calendar was removed, replaced or signed out while it was being read.
   */
  async function readLink(address: string | null, selfEmail?: string | null) {
    if (!userId) throw new Error("Sign in again to use your calendar.");
    const target = address ?? link;
    if (!target) throw new Error("Paste the calendar's private address first.");
    const checked = checkCalendarLink(target);
    if (!checked.ok) throw new Error(checked.message);
    const started = calendarGeneration();
    setBusy(true);
    try {
      const res = await fetch("/api/calendar-feed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: checked.url }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Couldn't read that calendar.");
      }
      const { events, truncated } = await readCalendar(await res.text(), keepWindow(new Date()), {
        selfEmails: selfEmail ? [selfEmail] : [],
      });
      if (started !== calendarGeneration()) return null;
      const name = describeCalendarLink(checked.url);
      if (!saveCalendar(storage(), userId, { name, events, importedAt: Date.now() })) {
        throw new Error("Couldn't keep that calendar on this device.");
      }
      saveLink(storage(), userId, checked.url);
      window.dispatchEvent(new Event(CALENDAR_EVENT));
      return { count: events.length, truncated };
    } finally {
      setBusy(false);
    }
  }

  return {
    calendar,
    skipped,
    link,
    busy,
    importFile,
    readLink,
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
