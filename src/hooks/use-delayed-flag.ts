"use client";

import { useEffect, useState } from "react";

import { SPINNER_DELAY_MS, scheduleDelayedShow } from "@/lib/loading-delay";

/**
 * True only once `isPending` has stayed true for `delayMs`; false again as soon as `isPending` is false. Every spinner
 * waits through this, so a fast save shows nothing. The timer starts over on every change of `isPending` and stops on
 * unmount, so a quick true, false, true never shows it early and a gone component never sets state.
 */
export function useDelayedFlag(isPending: boolean, delayMs = SPINNER_DELAY_MS): boolean {
  const [waitedLongEnough, setWaitedLongEnough] = useState(false);
  useEffect(() => {
    setWaitedLongEnough(false);
    if (!isPending) return;
    return scheduleDelayedShow({ delayMs, onShow: () => setWaitedLongEnough(true) });
  }, [isPending, delayMs]);
  // Not only the state: the render where `isPending` turns false must already hide it.
  return isPending && waitedLongEnough;
}
