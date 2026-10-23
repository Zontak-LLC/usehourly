"use client";

import { useEffect, useRef, useState } from "react";

import { PALETTE } from "@/lib/palette";

/*
 * The small reward for adding time (2026-10-23): a tapped chip sends a "+1h" token flying into the time field, the field
 * gives a halo in that chip's colour, the value rolls up to its new total, and Log time spins its clock and makes the new
 * row glow as it lands. All of it is decoration on top of a value that is already set, so nothing waits for it, and
 * with "reduce motion" none of it runs.
 */

/** Each quick-time chip has its own halo, from the brand blend: 30 min amber, 1 hour coral, 2 hours violet. */
const HALO_BY_MINUTES: Record<number, string> = {
  30: PALETTE.brandBlend[0],
  60: PALETTE.brandBlend[1],
  120: PALETTE.brandBlend[3],
};

export function haloColour(minutes: number): string {
  return HALO_BY_MINUTES[minutes] ?? PALETTE.brandBlend[0];
}

export function lessMotion(): boolean {
  return typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const soft = (colour: string, percent: number) => `color-mix(in oklab, ${colour} ${percent}%, transparent)`;

/** A "+1h" token that leaves the chip and lands in the field, then the field's halo. */
export function flyIn(from: HTMLElement, to: HTMLElement, text: string, colour: string) {
  if (lessMotion()) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const token = document.createElement("span");
  token.textContent = text;
  token.setAttribute("aria-hidden", "true");
  Object.assign(token.style, {
    position: "fixed",
    left: `${a.left + a.width / 2}px`,
    top: `${a.top + a.height / 2}px`,
    zIndex: "60",
    pointerEvents: "none",
    padding: "2px 8px",
    borderRadius: "999px",
    font: "700 13px/1.4 var(--font-mono, monospace)",
    color: "#12151b", // colour-ok: dark ink on the bright token, the same in light and dark mode
    background: colour,
    boxShadow: `0 6px 16px -6px ${soft(colour, 80)}`,
    transform: "translate(-50%, -50%)",
  });
  document.body.appendChild(token);
  const dx = b.left + Math.min(b.width / 2, 80) - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const flight = token.animate(
    [
      { transform: "translate(-50%, -50%) scale(0.6)", opacity: 0 },
      { transform: "translate(-50%, -50%) scale(1.1)", opacity: 1, offset: 0.2 },
      { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 24}px)) scale(1)`, offset: 0.6 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.5)`, opacity: 0 },
    ],
    { duration: 520, easing: "cubic-bezier(.3,.7,.3,1)" },
  );
  flight.onfinish = () => {
    token.remove();
    halo(to, colour);
  };
}

/** A ring in `colour` that swells around the element and fades away. */
export function halo(el: HTMLElement, colour: string) {
  if (lessMotion()) return;
  // On a dark page a fading coral or amber reads as brown, so the ring is brighter there (mixed with white).
  const ring = document.documentElement.classList.contains("dark")
    ? `color-mix(in oklab, ${colour} 70%, white)`
    : colour;
  el.animate(
    [
      { boxShadow: `0 0 0 0 ${soft(ring, 70)}` },
      { boxShadow: `0 0 0 6px ${soft(ring, 45)}`, offset: 0.35 },
      { boxShadow: `0 0 0 14px ${soft(ring, 0)}` },
    ],
    { duration: 700, easing: "ease-out" },
  );
}

/** Log time: the clock icon makes one quick turn. */
export function spin(el: Element | null) {
  if (!el || lessMotion()) return;
  el.animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], {
    duration: 550,
    easing: "cubic-bezier(.4,1.6,.5,1)",
  });
}

/** The entry just logged glows once when its row appears (it arrives after the list refreshes, so look for a moment). */
export function glowEntry(id: string) {
  if (lessMotion()) return;
  const started = performance.now();
  const look = () => {
    const row = document.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"]`);
    if (row) {
      row.animate([{ backgroundColor: soft("var(--amber)", 30) }, { backgroundColor: "transparent" }], {
        duration: 1400,
        easing: "ease-out",
      });
      return;
    }
    if (performance.now() - started < 2000) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}

/**
 * A number of minutes that rolls from the last value it showed to `value` (an odometer), or null while it is still.
 * Only `roll()` starts a roll, so typing never animates; a new value or `stop()` ends it at once.
 */
export function useRoll(ms = 420) {
  const [shown, setShown] = useState<number | null>(null);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  function stop() {
    cancelAnimationFrame(frame.current);
    setShown(null);
  }
  function roll(from: number, to: number) {
    cancelAnimationFrame(frame.current);
    if (lessMotion() || from === to) return setShown(null);
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const eased = 1 - (1 - k) ** 3;
      if (k >= 1) return setShown(null);
      setShown(Math.round((from + (to - from) * eased) / 5) * 5);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }
  return { shown, roll, stop };
}
