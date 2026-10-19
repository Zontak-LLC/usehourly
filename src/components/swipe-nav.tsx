"use client";

import { useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { swipeTarget } from "@/lib/swipe-nav";

/** Things a sideways finger movement belongs to: typing, menus and dialogs, and anything marked data-no-swipe. */
const OWN_GESTURE =
  'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"], [data-no-swipe]';

/** True when the touch started inside something that scrolls sideways (a wide table, a chip row). */
function inScroller(from: Element | null): boolean {
  for (let el = from; el && el !== document.body; el = el.parentElement) {
    const overflowX = getComputedStyle(el).overflowX;
    if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

/**
 * On a phone, swiping sideways moves through the tab bar's pages in the order of its buttons (swipe left for the next
 * one, right for the previous). The decision rules are in `lib/swipe-nav.ts`; this only watches the finger and keeps
 * out of the way of anything that uses sideways movement itself.
 */
export function SwipeNav() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return; // a phone or tablet, not a mouse
    let start: { x: number; y: number; at: number; blocked: boolean } | null = null;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      const target = e.target instanceof Element ? e.target : null;
      const blocked =
        e.touches.length !== 1 ||
        !t ||
        !!target?.closest(OWN_GESTURE) ||
        inScroller(target) ||
        !!document.querySelector('[role="dialog"]');
      start = t ? { x: t.clientX, y: t.clientY, at: Date.now(), blocked } : null;
    };
    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      const t = e.changedTouches[0];
      if (!s || s.blocked || !t) return;
      if (window.getSelection()?.toString()) return; // dragging to select text
      const to = swipeTarget({
        pathname,
        dx: t.clientX - s.x,
        dy: t.clientY - s.y,
        ms: Date.now() - s.at,
        startX: s.x,
        width: window.innerWidth,
      });
      if (to) router.push(to);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [pathname, router]);

  return null;
}
