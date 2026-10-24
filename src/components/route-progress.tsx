"use client";

import { useEffect, useRef, useState } from "react";

import { usePathname } from "next/navigation";

import { progressStep, shouldTrackClick } from "@/lib/route-progress";

/** How long a page switch may take before the bar shows: a fast switch shows nothing. */
const SHOW_AFTER_MS = 120;
/** Never leave the bar up: a switch that never finishes (an error page, a blocked request) hides it after this. */
const GIVE_UP_MS = 10_000;

function clearAll(timers: { current: number[] }) {
  for (const t of timers.current) window.clearTimeout(t);
  timers.current = [];
}

/**
 * A thin line across the top of the screen while the next page is on its way. The old page stays visible until
 * the new one is ready (there is no loading page), so without this a slow switch looked like the app had frozen.
 * It starts on a click on an in-app link to another page, creeps toward 90%, and finishes when the address changes.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState<number | null>(null); // null = hidden
  const timers = useRef<number[]>([]);
  const shownPath = useRef(pathname);

  useEffect(() => {
    const start = () => {
      clearAll(timers);
      timers.current.push(
        window.setTimeout(() => {
          setWidth(15);
          const creep = () => {
            setWidth((w) => (w === null ? null : progressStep(w)));
            timers.current.push(window.setTimeout(creep, 300));
          };
          timers.current.push(window.setTimeout(creep, 300));
        }, SHOW_AFTER_MS),
        window.setTimeout(() => {
          clearAll(timers);
          setWidth(null);
        }, GIVE_UP_MS),
      );
    };
    const onClick = (e: MouseEvent) => {
      if (shouldTrackClick(e, window.location)) start();
    };
    document.addEventListener("click", onClick, true);
    // Back or Forward: only a move to another page (Back between two #sections of one page changes nothing).
    const onPop = () => {
      if (window.location.pathname !== shownPath.current) start();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      clearAll(timers);
    };
  }, []);

  // The new page is in: run the line to the end, then fade it out.
  useEffect(() => {
    shownPath.current = pathname;
    clearAll(timers);
    setWidth((w) => (w === null ? null : 100));
    timers.current.push(window.setTimeout(() => setWidth(null), 250));
  }, [pathname]);

  if (width === null) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 print:hidden"
      data-testid="route-progress"
    >
      <div
        className={`h-full bg-amber motion-safe:transition-[width,opacity] motion-safe:duration-300 motion-safe:ease-out ${width === 100 ? "opacity-0 delay-100" : "opacity-100"}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
