"use client";

import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { clearOfflineData, OWNER_KEY, ownerAction, restoreQueries, saveQueries } from "@/lib/offline-cache";

const CurrentUser = createContext<string | null>(null);

/** The signed-in account's id, known from the page itself (so it is also known with no connection). */
export const useCurrentUserId = () => useContext(CurrentUser);

/**
 * Wraps the dashboard. It tells everything below who is signed in, keeps a copy of the everyday data in this browser
 * as it changes (so the app has something to show offline), and puts that copy back when the app opens. If the copy
 * belongs to a different account, it is forgotten instead. See lib/offline-cache.ts.
 */
/** A layout effect runs before the browser paints (and before any query below starts), but only exists in the browser. */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function OfflineGuard({ userId, children }: { userId: string; children: ReactNode }) {
  const queryClient = useQueryClient();

  // Put the saved copy back BEFORE the first paint, so a returning visitor never sees an empty frame while the first
  // request is on its way: the page paints with its last data and the fresh data replaces it a moment later.
  useBeforePaint(() => {
    let owner: string | null = null;
    try {
      owner = localStorage.getItem(OWNER_KEY);
    } catch {
      return; // storage blocked: no offline copy
    }
    if (ownerAction(owner, userId) === "reset") {
      void clearOfflineData().then(() => {
        try {
          localStorage.setItem(OWNER_KEY, userId);
        } catch {
          // storage blocked
        }
      });
    } else {
      restoreQueries(queryClient, localStorage);
    }
  }, [userId, queryClient]);

  useEffect(() => {
    try {
      if (ownerAction(localStorage.getItem(OWNER_KEY), userId) === "reset") return; // being cleared: save nothing yet
    } catch {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => saveQueries(queryClient, localStorage);
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(save, 1500);
    });
    const onHide = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    return () => {
      unsubscribe();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
    };
  }, [userId, queryClient]);

  return <CurrentUser.Provider value={userId}>{children}</CurrentUser.Provider>;
}
