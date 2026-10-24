"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { badgeOn, type InstallOffer, installOffer } from "@/lib/install-app";
import { trpc } from "@/lib/trpc";

/** Chrome's install prompt event (not in the DOM types). */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let saved: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

// Listened for as soon as this file loads: the browser fires it once, often before the menu is first drawn.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for the menu instead of Chrome's own mini bar
    saved = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    saved = null;
    notify();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function standaloneNow(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

/** What the account menu offers to install the app, and the action for "prompt". */
export function useInstallApp(): { offer: InstallOffer; install: () => Promise<void> } {
  const hasPrompt = useSyncExternalStore(
    subscribe,
    () => saved !== null,
    () => false,
  );
  // Read after the first paint so the server and browser draw the same menu.
  const [env, setEnv] = useState<{ standalone: boolean; userAgent: string; maxTouchPoints: number } | null>(null);
  useEffect(() => {
    setEnv({
      standalone: standaloneNow(),
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
    });
  }, []);
  const offer = env ? installOffer({ ...env, hasPrompt }) : null;
  async function install() {
    if (!saved) return;
    // Start the prompt BEFORE forgetting the event: the minifier folded a "const e = saved" alias into a read of the
    // already-cleared variable (found by e2e/installed-app.spec.ts on the production build).
    const shown = saved.prompt();
    saved = null; // a prompt can be shown once
    notify();
    await shown;
  }
  return { offer, install };
}

/**
 * While a timer runs, the home-screen icon carries a badge (App Badge API: installed apps on Android, Windows, macOS and
 * iPhone from iOS 16.4). It only READS the running-timer data the timer screens already fetch, so it adds no request to
 * any page; a stop anywhere in the app updates that data and clears the badge.
 */
export function TimerBadge() {
  const running = trpc.entry.running.useQuery(undefined, { enabled: false });
  const on = badgeOn(running.data);
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: () => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge || !nav.clearAppBadge || running.data === undefined) return;
    (on ? nav.setAppBadge() : nav.clearAppBadge()).catch(() => undefined); // not installed, or blocked
  }, [on, running.data]);
  return null;
}
