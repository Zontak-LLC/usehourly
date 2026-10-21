"use client";

import { signOut } from "next-auth/react";

import { AI_KEY_STORAGE } from "@/lib/ai-key";
import { CALENDAR_KEY, CALENDAR_LINK_KEY, CALENDAR_SKIPPED_KEY } from "@/lib/calendar-store";
import { clearLocalCopy } from "@/lib/local-sync/active";
import { clearOfflineData, stopSaving } from "@/lib/offline-cache";
import { PENDING_KEY } from "@/lib/offline-queue";

type SignOutOptions = Parameters<typeof signOut>[0];

/**
 * Signs out, first forgetting the kept pages and the saved copy of the person's data so nothing of theirs stays
 * readable on a shared device. Entries typed offline that have not been sent yet are kept (they belong to the account and
 * are sent when it signs in again), unless `forgetEverything` is set, as when the account is deleted.
 */
export async function signOutOfDevice(options?: SignOutOptions, forgetEverything = false) {
  stopSaving(); // before clearing, so the save that happens as the page is left cannot put the copy back
  await clearLocalCopy(forgetEverything); // sends what is waiting if it can, then forgets the copy
  await clearOfflineData();
  try {
    localStorage.removeItem(AI_KEY_STORAGE); // the person's own AI key never stays on a shared device
    localStorage.removeItem(CALENDAR_KEY); // nor their calendar
    localStorage.removeItem(CALENDAR_SKIPPED_KEY);
    localStorage.removeItem(CALENDAR_LINK_KEY); // the private address is a secret
  } catch {
    // storage blocked
  }
  if (forgetEverything) {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      // storage blocked
    }
  }
  return signOut(options);
}
