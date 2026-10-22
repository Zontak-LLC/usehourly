"use client";

import { useEffect, useState } from "react";

/** A number that counts up to its value (a figure settling), unless the person prefers less motion. */
export function useCountUp(value: number, ms = 900, initial = 0): number {
  const [shown, setShown] = useState(initial);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setShown(Math.round(value * (1 - (1 - k) ** 3)));
      if (k < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value, ms]);
  return shown;
}
