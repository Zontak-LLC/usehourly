import { useEffect, useState } from "react";

import { SPINNER_DELAY_MS } from "@/lib/loading";

/**
 * True only once `active` has stayed true for `delayMs`; false again as soon as `active` is false. Every spinner waits
 * through this, so a fast save shows nothing. The timer starts over on every change of `active` and stops on unmount,
 * so a quick true, false, true never shows it early and a gone component never sets state.
 */
export function useDelayedFlag(active: boolean, delayMs = SPINNER_DELAY_MS): boolean {
  const [waitedLongEnough, setWaitedLongEnough] = useState(false);
  useEffect(() => {
    setWaitedLongEnough(false);
    if (!active) return;
    const timer = setTimeout(() => setWaitedLongEnough(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  // Not only the state: the render where `active` turns false must already hide it.
  return active && waitedLongEnough;
}
