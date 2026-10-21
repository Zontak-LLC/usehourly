"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "hourly:openClients";

/** A client with this many projects or fewer starts open; a bigger one starts closed so the page stays short. */
export const OPEN_BY_DEFAULT_UP_TO = 1;

/** The first few projects of an open client; the rest are behind "Show all". */
export const PROJECTS_SHOWN = 4;

/** What the person chose by hand: client id -> open or closed. Anything not chosen follows the default. */
function load(): Record<string, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, boolean> = {};
    for (const [id, v] of Object.entries(raw)) if (typeof v === "boolean") out[id] = v;
    return out;
  } catch {
    return {};
  }
}

/** Which client cards are open, remembered on this device (never sent anywhere). */
export function useOpenClients() {
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  useEffect(() => setChosen(load()), []);
  const isOpen = useCallback(
    (id: string, projectCount: number) => chosen[id] ?? projectCount <= OPEN_BY_DEFAULT_UP_TO,
    [chosen],
  );
  const setOpen = useCallback((id: string, open: boolean) => {
    setChosen((prev) => {
      const next = { ...prev, [id]: open };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Remembering is a convenience.
      }
      return next;
    });
  }, []);
  return { isOpen, setOpen };
}
