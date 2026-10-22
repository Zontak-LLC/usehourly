import { useLayoutEffect, useRef } from "react";

/**
 * When a list of blocks changes order, each block slides from where it was to where it is now (a short "FLIP"
 * animation), so the eye can follow what moved. Give each block's element to `ref(id)`; pass a string that changes
 * when the order changes. Nothing moves on the first draw, and not at all when the person prefers reduced motion.
 */
export function useReorderAnimation(orderKey: string) {
  const elements = useRef(new Map<string, HTMLElement>());
  const before = useRef(new Map<string, { x: number; y: number }>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: orderKey is the trigger; the maps are refs
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = new Map<string, { x: number; y: number }>();
    for (const [id, el] of elements.current) {
      const r = el.getBoundingClientRect();
      now.set(id, { x: r.left + window.scrollX, y: r.top + window.scrollY });
    }
    if (!reduce) {
      for (const [id, el] of elements.current) {
        const from = before.current.get(id);
        const to = now.get(id);
        if (!from || !to) continue;
        const dx = from.x - to.x;
        const dy = from.y - to.y;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: 280,
          easing: "cubic-bezier(.2,.8,.2,1)",
        });
      }
    }
    before.current = now;
  }, [orderKey]);

  return (id: string) => (el: HTMLElement | null) => {
    if (el) elements.current.set(id, el);
    else elements.current.delete(id);
  };
}
