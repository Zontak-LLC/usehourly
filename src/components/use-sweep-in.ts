"use client";

import { useEffect, useState } from "react";

/** Starts at zero and moves to `value` after the first paint, so a progress line sweeps in. */
export function useSweepIn(value: number): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return shown;
}
