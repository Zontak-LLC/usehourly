"use client";

import { useEffect, useRef, useState } from "react";

import { DigitalWatch } from "@/components/digital-watch";

const DAYS = ["M", "T", "W", "T", "F"];
const BARS: [number, number][] = [
  [62, 18],
  [48, 30],
  [70, 12],
  [40, 36],
  [66, 20],
];

/**
 * "From hours to paid" as three short pictures that draw themselves once they scroll into view: the day is logged, the
 * week stacks up into bars, and the invoice settles with its total and a PAID stamp. Drawn from the product's own
 * shapes (the dial's amber, the week's bars, the invoice sheet), not screenshots.
 */
export function LandingStory() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const ease = "cubic-bezier(.2,.8,.2,1)";
  return (
    <div ref={ref} className="grid gap-4 md:grid-cols-3">
      <article className="flex flex-col gap-4 rounded-3xl border bg-card p-6 shadow-[var(--shadow-sheet)]">
        <div aria-hidden className="grid h-44 place-items-center">
          <div className="w-60">
            <DigitalWatch
              mode={on ? { kind: "running", seconds: 2530, label: "Northwind" } : { kind: "time" }}
              label="A stopwatch running"
            />
          </div>
        </div>
        <div>
          <h3 className="font-bold font-display text-xl">Log a day in seconds</h3>
          <p className="mt-1 text-muted-foreground">
            Type 1.5 or 90m and press Enter, or start the stopwatch and file what it hands you when you stop.
          </p>
        </div>
      </article>

      <article className="flex flex-col gap-4 rounded-3xl border bg-card p-6 shadow-[var(--shadow-sheet)]">
        <div aria-hidden className="flex h-44 items-end justify-between gap-2">
          {BARS.map(([a, b], i) => (
            <div key={DAYS[i] + a} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="flex w-full flex-1 flex-col-reverse gap-0.5">
                <div
                  className="w-full rounded-md bg-amber"
                  style={{
                    height: on ? `${a}%` : "0%",
                    transition: `height 1s ${ease} ${i * 90}ms`,
                  }}
                />
                <div
                  className="w-full rounded-md"
                  style={{
                    background: "#4f6bf5",
                    height: on ? `${b}%` : "0%",
                    transition: `height 1s ${ease} ${i * 90 + 120}ms`,
                  }}
                />
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">{DAYS[i]}</span>
            </div>
          ))}
        </div>
        <div>
          <h3 className="font-bold font-display text-xl">See the week add up</h3>
          <p className="mt-1 text-muted-foreground">
            Every project in its own colour. The month, the year and your Excel export come from the same entries.
          </p>
        </div>
      </article>

      <article className="flex flex-col gap-4 rounded-3xl border bg-card p-6 shadow-[var(--shadow-sheet)]">
        <div aria-hidden className="relative grid h-44 place-items-center">
          <div
            className="relative w-full max-w-[15rem] rounded-md border bg-background p-4 shadow-[var(--shadow-sheet)]"
            style={{
              opacity: on ? 1 : 0,
              transform: on ? "none" : "translateY(14px) rotate(-0.4deg)",
              transition: `opacity .7s ${ease}, transform .7s ${ease}`,
            }}
          >
            <p className="font-display font-extrabold text-lg">Invoice</p>
            <div className="mt-2 flex justify-between border-b py-1 text-xs">
              <span>Mobile app</span>
              <span className="font-mono">44.00 h × $110</span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Total</span>
              <span className="font-display font-extrabold text-2xl tabular-nums">$4,840.00</span>
            </div>
            <span
              className="absolute top-3 right-3 rounded-md px-2 font-display font-extrabold text-success text-xl tracking-widest ring-4 ring-success-bright ring-inset"
              style={{
                opacity: on ? 0.9 : 0,
                transform: on ? "rotate(-10deg) scale(1)" : "rotate(-10deg) scale(1.6)",
                transition: `opacity .3s ease 1.3s, transform .4s cubic-bezier(.2,1.6,.4,1) 1.3s`,
              }}
            >
              PAID
            </span>
          </div>
        </div>
        <div>
          <h3 className="font-bold font-display text-xl">Bill it, share it, get paid</h3>
          <p className="mt-1 text-muted-foreground">
            Make the invoice from your hours, download the PDF or send a private link, and mark it paid when the money
            arrives.
          </p>
        </div>
      </article>
    </div>
  );
}
