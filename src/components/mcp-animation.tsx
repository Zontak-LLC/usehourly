"use client";

import { useEffect, useRef, useState } from "react";

const PROMPT = "Log 2 hours on Acme today";
const STEPS = ["typing", "to-server", "to-app", "back", "hold"] as const;
type Step = (typeof STEPS)[number];
const AT: Record<Step, number> = { typing: 1700, "to-server": 900, "to-app": 900, back: 1100, hold: 3600 };

/** A packet of light that rides a connector from one end to the other while `go` is on. */
function Wire({ go, back = false, color }: { go: boolean; back?: boolean; color: string }) {
  return (
    <div aria-hidden className="relative h-0.5 flex-1 self-center rounded-full bg-foreground/15">
      <span
        className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full transition-[left,opacity] duration-700 ease-in-out"
        style={{
          background: color,
          boxShadow: `0 0 14px 3px ${color}`,
          left: go ? (back ? "0%" : "calc(100% - 12px)") : back ? "calc(100% - 12px)" : "0%",
          opacity: go ? 1 : 0,
        }}
      />
    </div>
  );
}

/**
 * The MCP story as a loop: an assistant types a request, it travels through the UseHourly MCP server, a row lands in
 * the timesheet, and the answer comes back. It starts when it scrolls into view, loops while visible, and with reduced
 * motion it shows the finished picture and stands still.
 */
export function McpAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("hold");
  const [chars, setChars] = useState(PROMPT.length);
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window);
    setReduced(still);
    if (still) return;
    let timer = 0;
    let typer = 0;
    let live = false;
    const run = (i: number) => {
      const s = STEPS[i % STEPS.length];
      setStep(s);
      if (s === "typing") {
        setChars(0);
        let n = 0;
        window.clearInterval(typer);
        typer = window.setInterval(() => {
          n += 1;
          setChars(n);
          if (n >= PROMPT.length) window.clearInterval(typer);
        }, 55);
      }
      timer = window.setTimeout(() => live && run(i + 1), AT[s]);
    };
    const io = new IntersectionObserver(
      (es) => {
        const seen = es.some((e) => e.isIntersecting);
        if (seen && !live) {
          live = true;
          run(0);
        } else if (!seen && live) {
          live = false;
          window.clearTimeout(timer);
          window.clearInterval(typer);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
      window.clearTimeout(timer);
      window.clearInterval(typer);
    };
  }, []);

  const toServer = step === "to-server";
  const toApp = step === "to-app";
  const back = step === "back";
  const done = step === "back" || step === "hold";
  const serverOn = toServer || toApp || back;
  const typed = reduced ? PROMPT : PROMPT.slice(0, chars);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Animation: you ask your AI assistant to log 2 hours on Acme. The request travels through the UseHourly MCP server, a new row appears in your timesheet, and the assistant answers that it is logged."
      className="w-full rounded-3xl bg-gradient-to-b from-card to-muted p-4 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 sm:p-6"
    >
      <div aria-hidden className="flex flex-col gap-5">
        {/* the assistant */}
        <div className="flex flex-col gap-2 rounded-2xl bg-card p-3 ring-1 ring-foreground/10">
          <p className="flex items-center gap-2 font-mono text-[11px] text-foreground/75 uppercase tracking-widest">
            <span className="size-2 rounded-full bg-[#8A6CFF]" /> Your assistant
          </p>
          <div className="ml-auto min-h-9 max-w-[90%] rounded-2xl rounded-br-sm bg-amber px-3 py-2 text-[#1b1405] text-sm">
            {typed}
            {step === "typing" && <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-[#1b1405]" />}
          </div>
          <div
            className={`max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm transition-all duration-500 ${
              done || reduced ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
          >
            Logged <strong>2:00</strong> on Acme · Website. Anything else?
          </div>
        </div>

        {/* the road: assistant to server to app */}
        <div className="flex items-stretch gap-3">
          <div
            className={`flex w-32 shrink-0 flex-col items-center gap-1 rounded-2xl bg-card p-3 text-center ring-1 transition-all duration-500 ${
              serverOn ? "ring-2 ring-[#8A6CFF]" : "ring-foreground/10"
            }`}
            style={serverOn ? { boxShadow: "0 0 28px -4px #8A6CFF" } : undefined}
          >
            <span className="font-mono text-[11px] text-foreground/75 uppercase tracking-widest">MCP server</span>
            <span className="font-bold font-display text-sm">UseHourly</span>
            <span className="font-mono text-[10px] text-foreground/70">/api/mcp</span>
            <span
              className={`mt-1 rounded-full bg-[#8A6CFF]/20 px-2 py-0.5 font-mono text-[11px] transition-opacity duration-500 ${
                toApp || toServer ? "opacity-100" : "opacity-0"
              }`}
            >
              log_time
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
            <Wire go={toServer} color="#F5A524" />
            <Wire go={toApp} color="#8A6CFF" />
            <Wire go={back} back color="#3DDC97" />
          </div>
        </div>

        {/* UseHourly */}
        <div className="flex flex-col gap-2 rounded-2xl bg-card p-3 ring-1 ring-foreground/10">
          <p className="flex items-center justify-between font-mono text-[11px] text-foreground/75 uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber" /> Your timesheet
            </span>
            <span className="font-display font-extrabold text-base text-foreground normal-case tabular-nums tracking-normal">
              {toApp || done || reduced ? "8:30" : "6:30"}
            </span>
          </p>
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-sm">
            <span>Acme · Strategy</span>
            <span className="font-mono">4:30</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-sm">
            <span>Northwind · Support</span>
            <span className="font-mono">2:00</span>
          </div>
          <div
            className={`flex items-center justify-between rounded-lg bg-amber/25 px-3 py-1.5 text-sm ring-1 ring-amber/60 transition-all duration-500 ${
              toApp || done || reduced ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
            }`}
          >
            <span>Acme · Website</span>
            <span className="font-mono">2:00</span>
          </div>
        </div>
      </div>
    </div>
  );
}
