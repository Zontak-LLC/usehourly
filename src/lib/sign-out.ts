"use client";

import { signOut } from "next-auth/react";

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
  await clearOfflineData();
  if (forgetEverything) {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      // storage blocked
    }
  }
  return signOut(options);
}
