"use client";

import type { ReactNode } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * "‹ October 2026 ›": the one way to step through periods (Week's weeks, Month's months, the Month day's days). The label
 * names what shows; the arrows are 40px, named by `prev` and `next` ("Previous month").
 */
export function PeriodStepper({
  label,
  prev,
  next,
  onPrev,
  onNext,
  className = "",
}: {
  label: ReactNode;
  prev: string;
  next: string;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center overflow-hidden rounded-lg border border-foreground/25 bg-card ${className}`}>
      <Button size="icon" variant="ghost" className="size-10 rounded-none" onClick={onPrev} aria-label={prev}>
        <ChevronLeft />
      </Button>
      <span className="min-w-36 flex-1 border-x px-3 text-center font-medium text-sm tabular-nums leading-10">
        {label}
      </span>
      <Button size="icon" variant="ghost" className="size-10 rounded-none" onClick={onNext} aria-label={next}>
        <ChevronRight />
      </Button>
    </div>
  );
}
