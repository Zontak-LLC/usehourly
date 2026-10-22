"use client";

import { useEffect, useState } from "react";

import { runningMinutes } from "@/lib/day-dial";

/** The minutes a running timer has added so far, kept fresh every 15 seconds (0 when there is no timer to count). */
export function useRunningMinutes(startedAt: string | Date | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [startedAt]);
  return runningMinutes(startedAt, now);
}
