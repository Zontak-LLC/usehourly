"use client";

import { Bot, Plug } from "lucide-react";

import { trpc } from "@/lib/trpc";

/** A small drawing: records drop into a vault drawer, with live counts of what is inside. */
export function DataVault() {
  const clients = trpc.clients.list.useQuery();
  const projects = clients.data?.reduce((n, c) => n + c.projects.length, 0);
  const figures: [string, number | undefined][] = [
    ["Clients", clients.data?.length],
    ["Projects", projects],
  ];
  return (
    <div className="grid items-center gap-6 rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 sm:grid-cols-[auto_1fr]">
      <svg viewBox="0 0 200 130" role="img" aria-label="Your records going into a safe drawer" className="mx-auto w-48">
        <title>Your records going into a safe drawer</title>
        <rect
          x="20"
          y="52"
          width="160"
          height="70"
          rx="14"
          fill="var(--muted)"
          stroke="var(--border)"
          strokeWidth="2"
        />
        <rect x="32" y="64" width="136" height="46" rx="8" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
        <rect x="84" y="82" width="32" height="8" rx="4" fill="var(--amber)" />
        {[0, 1, 2].map((i) => (
          <g key={i} style={{ animationDelay: `${i * 1.2}s` }}>
            <rect
              x={62 + i * 26}
              y="6"
              width="30"
              height="38"
              rx="4"
              fill="var(--card)"
              stroke="var(--amber)"
              strokeWidth="2"
            />
            <line
              x1={69 + i * 26}
              y1="16"
              x2={85 + i * 26}
              y2="16"
              stroke="var(--amber)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1={69 + i * 26}
              y1="24"
              x2={85 + i * 26}
              y2="24"
              stroke="var(--border)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1={69 + i * 26}
              y1="32"
              x2={79 + i * 26}
              y2="32"
              stroke="var(--border)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        ))}
      </svg>
      <div>
        <p className="font-mono text-[11px] text-foreground/75 uppercase tracking-widest">What is in your records</p>
        <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
          {figures.map(([label, n]) => (
            <div key={label} className="flex flex-col">
              <dd className="order-1 font-display font-extrabold text-4xl tabular-nums leading-none">{n ?? "–"}</dd>
              <dt className="order-2 mt-1 text-foreground/75 text-sm">{label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-muted-foreground text-sm">
          It is yours: take it all with you any time, in files any tool can open.
        </p>
      </div>
    </div>
  );
}

/** How an assistant gets connected, in three steps drawn as a path from the assistant to UseHourly. */
export function AssistantLink() {
  const steps = [
    ["1", "Make a token", "Below: name it, choose read only or read and change."],
    ["2", "Give it to your assistant", "Paste the command or the file it shows you, once."],
    [
      "3",
      "Ask for what you need",
      "\u201cLog 2 hours on Acme today.\u201d \u201cMake last month\u2019s invoice.\u201d",
    ],
  ];
  return (
    <div className="grid gap-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber/15">
          <Bot className="size-6" aria-hidden />
        </span>
        <span aria-hidden className="h-0.5 flex-1 border-foreground/25 border-t-2 border-dashed" />
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber text-[#1b1405]">
          <Plug className="size-6" aria-hidden />
        </span>
      </div>
      <ol className="grid gap-4 sm:grid-cols-3">
        {steps.map(([n, title, text]) => (
          <li key={n} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber font-bold text-[#1b1405] text-sm">
              {n}
            </span>
            <span className="min-w-0">
              <span className="block font-bold font-display">{title}</span>
              <span className="block text-foreground/75 text-sm">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
