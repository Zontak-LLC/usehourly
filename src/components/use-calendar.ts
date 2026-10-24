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
  loadGoogle,
  loadLink,
  loadRules,
  loadSkipped,
  type SavedCalendar,
  saveCalendar,
  saveGoogle,
  saveLink,
  saveRules,
} from "@/lib/calendar-store";
import { addRule, type CalendarRule } from "@/lib/calendar-suggest";
import { fetchGoogleEvents, GoogleCalendarError } from "@/lib/google-calendar";
import { requestGoogleToken, revokeGoogleToken } from "@/lib/google-identity";
import { safeStorage } from "@/lib/offline-cache";

/** Files over this are refused before reading (a calendar of many years is a few MB). */
const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** The calendar this account imported (this browser only), the meetings skipped, and how to import, skip and remove. */
export function useSavedCalendar() {
  const userId = useCurrentUserId();
  const [calendar, setCalendar] = useState<SavedCalendar | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [link, setLink] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  const [rules, setRules] = useState<readonly CalendarRule[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setCalendar(loadCalendar(safeStorage(), userId));
    setSkipped(loadSkipped(safeStorage(), userId));
    setLink(loadLink(safeStorage(), userId));
    setGoogle(loadGoogle(safeStorage(), userId));
    setRules(loadRules(safeStorage(), userId));
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
      const ok = saveCalendar(safeStorage(), userId, { name: file.name, events, importedAt: Date.now() });
      if (!ok) throw new Error("Couldn't keep that calendar on this device. Try a shorter range.");
      saveLink(safeStorage(), userId, null); // a file replaces a connected address
      saveGoogle(safeStorage(), userId, false);
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
      if (!saveCalendar(safeStorage(), userId, { name, events, importedAt: Date.now() })) {
        throw new Error("Couldn't keep that calendar on this device.");
      }
      saveLink(safeStorage(), userId, checked.url);
      saveGoogle(safeStorage(), userId, false);
      window.dispatchEvent(new Event(CALENDAR_EVENT));
      return { count: events.length, truncated };
    } finally {
      setBusy(false);
    }
  }

  /**
   * Opens Google's popup (this must follow a tap), then reads the recent meetings straight from the person's Google
   * Calendar in this browser. Nothing goes through UseHourly's servers. Throws a plain-words Error when it cannot, and
   * returns null (having saved nothing) when the calendar was removed or replaced while it was being read.
   */
  async function connectGoogle(clientId: string) {
    if (!userId) throw new Error("Sign in again to use your calendar.");
    cancelCalendarReads(); // a connected address still being read must not overwrite this
    const started = calendarGeneration();
    setBusy(true);
    try {
      const token = await requestGoogleToken(clientId);
      if (started !== calendarGeneration()) {
        revokeGoogleToken(); // disconnected while Google's window was open: drop the access it just gave
        return null;
      }
      const { events, truncated } = await fetchGoogleEvents(token, keepWindow(new Date()));
      if (started !== calendarGeneration()) return null;
      if (!saveCalendar(safeStorage(), userId, { name: "Google Calendar", events, importedAt: Date.now() })) {
        throw new Error("Couldn't keep that calendar on this device.");
      }
      saveLink(safeStorage(), userId, null); // Google replaces a connected address
      saveGoogle(safeStorage(), userId, true);
      window.dispatchEvent(new Event(CALENDAR_EVENT));
      return { count: events.length, truncated };
    } catch (err) {
      if (err instanceof GoogleCalendarError || err instanceof Error) throw err;
      throw new Error("Couldn't read your Google Calendar.");
    } finally {
      setBusy(false);
    }
  }

  return {
    calendar,
    google,
    connectGoogle,
    skipped,
    rules,
    /** "Always put '<word>' meetings on <project>" (issue 99). False when this browser would not keep it. */
    addRule: (rule: CalendarRule) => {
      if (!userId) return false;
      const ok = saveRules(safeStorage(), userId, addRule(loadRules(safeStorage(), userId), rule));
      window.dispatchEvent(new Event(CALENDAR_EVENT));
      return ok;
    },
    forgetRules: () => {
      if (userId) saveRules(safeStorage(), userId, []);
      window.dispatchEvent(new Event(CALENDAR_EVENT));
    },
    link,
    busy,
    importFile,
    readLink,
    skip: (id: string) => {
      if (userId) addSkipped(safeStorage(), userId, id);
      window.dispatchEvent(new Event(CALENDAR_EVENT));
    },
    remove: () => {
      revokeGoogleToken();
      forgetCalendar(safeStorage());
      window.dispatchEvent(new Event(CALENDAR_EVENT));
    },
  };
}
