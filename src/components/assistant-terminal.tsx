"use client";

import { useEffect, useRef, useState } from "react";

import { FINISHED, SCRIPT, type Tone } from "@/lib/assistant-script";

type Part = { c: Tone; t: string };

// A terminal is dark in light mode too, so these are fixed colours (the amber is the logo's hour hand).
const TONE: Record<Tone, string> = {
  prompt: "font-bold text-[#F5A524]",
  you: "text-white",
  dim: "text-[#7C8190]",
  tool: "text-[#3DDC97]",
  server: "text-[#8A9CFF]",
  arg: "text-[#B8A6FF]",
  ok: "text-[#3DDC97]",
  warn: "text-[#FFC857]",
  link: "text-[#8AB4FF] underline underline-offset-2",
  text: "text-[#D6D9E0]",
};

const HOLD_MS = 7000;

/** Types `script` into `show`, stopping the moment `alive()` turns false. Returns false if it was stopped. */
async function perform(show: (parts: Part[]) => void, alive: () => boolean): Promise<boolean> {
  const wait = (ms: number) => new Promise<boolean>((done) => setTimeout(() => done(alive()), ms));
  let done: Part[] = [];
  show(done);
  for (const seg of SCRIPT) {
    if (seg.k === "pause") {
      if (!(await wait(seg.ms))) return false;
    } else if (seg.k === "line") {
      done = [...done, { c: seg.c, t: seg.t }];
      show(done);
      if (!(await wait(70))) return false;
    } else {
      for (let i = 1; i <= seg.t.length; i += 1) {
        show([...done, { c: seg.c, t: seg.t.slice(0, i) }]);
        if (!(await wait(seg.t[i - 1] === "\n" ? 0 : 24 + Math.random() * 26))) return false;
      }
      done = [...done, { c: seg.c, t: seg.t }];
    }
  }
  return true;
}

/**
 * A Claude Code window that works through a bigger job with the UseHourly tools: it types the request, calls the tools,
 * finds a gap, asks, and ends with three private sign-off links. It plays while on screen and loops; with reduced
 * motion, or before it scrolls into view, it shows the finished screen.
 */
export function AssistantTerminal() {
  const ref = useRef<HTMLDivElement>(null);
  const [parts, setParts] = useState<Part[]>(FINISHED);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      return;
    }
    let run = 0;
    const play = async () => {
      const id = ++run;
      setPlaying(true);
      while (id === run) {
        if (!(await perform(setParts, () => id === run))) return;
        await new Promise((done) => setTimeout(done, HOLD_MS));
      }
    };
    const stop = () => {
      run += 1;
      setPlaying(false);
      setParts(FINISHED);
    };
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? play() : stop()), { threshold: 0.3 });
    io.observe(el);
    return () => {
      run += 1;
      io.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="A terminal showing Claude Code with UseHourly connected. It is asked to make last week's timesheet for every client. It builds three, finds a missing Tuesday for one client and asks about it. After a yes it logs two hours and creates three private sign-off links."
      className="overflow-hidden rounded-2xl border border-[#262A33] bg-[#0b0c10] shadow-[0_30px_90px_-40px_#F5A524]"
    >
      <div aria-hidden className="flex items-center gap-1.5 border-[#1c1e26] border-b px-4 py-3">
        <i className="size-2.5 rounded-full bg-[#FF5F57]" />
        <i className="size-2.5 rounded-full bg-[#FEBC2E]" />
        <i className="size-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-2 font-mono text-[#7C8190] text-xs">claude · usehourly connected</span>
      </div>
      {/* A fixed height (on a phone the newest line sits at the foot): the window never grows, so the page never jumps. */}
      <pre
        aria-hidden
        className="m-0 flex h-[41rem] flex-col justify-end overflow-hidden sm:justify-start p-4 font-mono text-[11.5px] leading-relaxed sm:h-[35rem] sm:p-5 sm:text-[13px]"
      >
        <div className="whitespace-pre-wrap break-words">
          {parts.map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the list only ever grows or resets, so an index is stable
            <span key={i} className={TONE[p.c]}>
              {p.t}
            </span>
          ))}
          {playing && (
            <span className="ml-px inline-block h-[1.1em] w-[0.55em] animate-pulse bg-[#F5A524] align-[-0.18em]" />
          )}
        </div>
      </pre>
    </div>
  );
}
