"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drives a short scene made of steps. `lasts` is how long each step stays in milliseconds. The scene plays from the first
 * step each time it scrolls into view and then holds its last step, which is a finished picture. With reduced motion
 * (or no IntersectionObserver) it shows the last step at once and never moves.
 */
export function useScene(lasts: number[]) {
  const ref = useRef<HTMLDivElement>(null);
  const last = lasts.length - 1;
  const [step, setStep] = useState(last);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    let timer = 0;
    const play = (i: number) => {
      setStep(i);
      if (i < last) timer = window.setTimeout(() => play(i + 1), lasts[i]);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          window.clearTimeout(timer);
          play(0);
        } else {
          window.clearTimeout(timer);
          setStep(last);
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
    // `lasts` is a constant array in each scene
    // biome-ignore lint/correctness/useExhaustiveDependencies: the durations never change
  }, [last, lasts]);
  return { ref, step };
}
