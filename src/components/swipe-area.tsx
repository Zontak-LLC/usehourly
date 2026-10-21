"use client";

import { type ReactNode, useEffect, useRef } from "react";

export const SWIPE_AREA_EVENT = "hourly:swipe";
export type SwipeDirection = "left" | "right";

/**
 * A region whose sideways swipes mean something on this page (the next or previous day, month, a meeting's Add or
 * Skip), instead of moving to the next tab. The gesture rules and the touch handling live in `SwipeNav` (it only
 * hands a finished swipe over as an event), so this is just a marked region with a handler. Touch only: the same
 * actions always have buttons too. The innermost area wins, so a meeting row can sit inside a day.
 */
export function SwipeArea({
  onSwipe,
  className,
  children,
}: {
  onSwipe: (direction: SwipeDirection) => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handler = useRef(onSwipe);
  handler.current = onSwipe;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const listen = (e: Event) => handler.current((e as CustomEvent<SwipeDirection>).detail);
    el.addEventListener(SWIPE_AREA_EVENT, listen);
    return () => el.removeEventListener(SWIPE_AREA_EVENT, listen);
  }, []);
  return (
    <div ref={ref} data-swipe-area className={className}>
      {children}
    </div>
  );
}
