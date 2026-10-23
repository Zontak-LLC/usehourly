"use client";

// TEMPORARY design lab (2026-10-23, not shipped): the D-1 digital watch in five looks, each in its three modes.

import { useEffect, useState } from "react";

import { DigitalWatch, type WatchLook } from "@/components/digital-watch";

const LOOKS: { look: WatchLook; name: string; note: string }[] = [
  { look: "glass", name: "1 · Glass", note: "Smoked glass, cream digits, faint unlit segments." },
  { look: "lcd", name: "2 · Classic LCD", note: "Grey-green screen, slanted digits, labels on the bezel." },
  { look: "dots", name: "3 · Dot matrix", note: "Pure black, white dot digits, a red REC dot." },
  { look: "nixie", name: "4 · Nixie", note: "Each digit glowing orange in its own glass tube." },
  { look: "industrial", name: "5 · Industrial", note: "Warm grey body, black window, one yellow light." },
];

export default function ClockLab() {
  const [seconds, setSeconds] = useState(754);
  useEffect(() => {
    const id = setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <main className="mx-auto max-w-6xl p-4">
      <h1 className="font-display font-extrabold text-3xl">The D-1, five looks</h1>
      <p className="mt-1 text-muted-foreground text-sm">
        Each row is one design in its three modes: telling the time, recording (a timer runs), and saved (just stopped).
      </p>
      <div className="mt-8 flex flex-col gap-12">
        {LOOKS.map((l) => (
          <section key={l.look} aria-label={l.name} className="flex flex-col gap-4">
            <div>
              <h2 className="font-semibold text-lg">{l.name}</h2>
              <p className="text-muted-foreground text-sm">{l.note}</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              <DigitalWatch look={l.look} mode={{ kind: "time" }} foot="0:46 today" progress={46 / 480} />
              <DigitalWatch
                look={l.look}
                mode={{ kind: "running", seconds, label: "MagSmith · Kirk" }}
                progress={0.4}
              />
              <DigitalWatch
                look={l.look}
                mode={{ kind: "stopped", seconds: 754, label: "MagSmith · Kirk" }}
                progress={0.4}
              />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
