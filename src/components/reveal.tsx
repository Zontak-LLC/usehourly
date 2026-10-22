"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Fades and lifts its content into place the first time it scrolls into view (a short delay in `delay` staggers a row of
 * them). Without JavaScript, or when the visitor asks for reduced motion, the content is simply there.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  /** Milliseconds to wait once visible, so neighbours arrive one after another. */
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const ref = useRef<HTMLElement>(null);
  // Starts true so server HTML and no-JS visitors see everything; the effect hides it only when it will animate it back.
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) return; // already on screen at load: no animation, no flash
    setShown(false);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as never}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(28px)",
        transition: `opacity .7s cubic-bezier(.2,.8,.2,1) ${delay}ms, transform .7s cubic-bezier(.2,.8,.2,1) ${delay}ms`,
      }}
    >
      {children}
    </Tag>
  );
}
