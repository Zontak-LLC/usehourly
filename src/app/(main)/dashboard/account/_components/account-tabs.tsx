"use client";

import { useEffect, useState } from "react";

import { Database, FileText, Sparkles, UserRound } from "lucide-react";

import { PALETTE } from "@/lib/palette";

import { SECTIONS } from "./account-section";

type SectionId = (typeof SECTIONS)[number]["id"];

const ICONS = { account: UserRound, invoices: FileText, data: Database, ai: Sparkles } as const;

/** The open tab glows in the one accent colour. */
const COLORS = { account: PALETTE.accent, invoices: PALETTE.accent, data: PALETTE.accent, ai: PALETTE.accent } as const;

const CAPTIONS = {
  account: "You and how you sign in",
  invoices: "What every invoice says",
  data: "Export, import, delete",
  ai: "Connect your assistant",
} as const;

/** An old or shorter address fragment still lands on the right tab (the demo banner links to #claim). */
function tabFromHash(hash: string): SectionId {
  const id = hash.replace(/^#/, "");
  if (id === "claim") return "account";
  return SECTIONS.find((s) => s.id === id)?.id ?? "account";
}

/** Which Account tab is open: kept in the address (#data), so a link or a reload comes back to the same tab. */
export function useAccountTab() {
  const [tab, setTabState] = useState<SectionId>("account");
  useEffect(() => {
    const read = () => setTabState(tabFromHash(window.location.hash));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  function setTab(next: SectionId) {
    setTabState(next);
    window.history.replaceState(null, "", `#${next}`);
  }
  return [tab, setTab] as const;
}

/** The tab strip: one section of the Account page at a time, each tab in its own colour (the open one glows and its icon pops). Arrow keys move between tabs; on a phone the tabs wrap into pill buttons so none is hidden. */
export function AccountTabs({ tab, onTab }: { tab: SectionId; onTab: (next: SectionId) => void }) {
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = SECTIONS[(index + step + SECTIONS.length) % SECTIONS.length];
    onTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }
  const index = Math.max(
    0,
    SECTIONS.findIndex((s) => s.id === tab),
  );
  const count = SECTIONS.length;
  // Dragging the thumb (or pressing anywhere on the track) picks the section whose quarter the finger is in. The tabs
  // above stay real tabs, so the keyboard and screen readers use them; the track is the same choice, by hand.
  function pick(e: React.PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.min(count - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * count)));
    if (SECTIONS[i].id !== tab) onTab(SECTIONS[i].id);
  }
  return (
    <div
      className="rounded-3xl border bg-card px-2 pt-2 pb-3 shadow-[var(--shadow-sheet)]"
      style={{ "--active": COLORS[SECTIONS[index].id] } as React.CSSProperties}
    >
      <div role="tablist" aria-label="Account sections" className="grid grid-cols-4">
        {SECTIONS.map((s, i) => {
          const on = s.id === tab;
          const Icon = ICONS[s.id];
          return (
            <button
              key={s.id}
              id={`tab-${s.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${s.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onTab(s.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              style={{ "--tab": COLORS[s.id] } as React.CSSProperties}
              className={`group flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-center text-xs leading-tight outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[var(--tab)] active:scale-[0.98] motion-reduce:transition-none sm:min-h-20 sm:text-sm ${
                on
                  ? "bg-muted font-semibold text-foreground ring-1 ring-foreground/15"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <span
                aria-hidden
                className={`grid size-9 place-items-center rounded-xl transition-all duration-300 group-hover:scale-105 motion-reduce:transition-none ${
                  on
                    ? "bg-[var(--tab)] text-[#1b1405] motion-safe:animate-[tab-pop_0.4s_ease-out]"
                    : "bg-muted text-foreground/70"
                }`}
              >
                <Icon className="size-5" />
              </span>
              {s.label}
              <span aria-hidden className="font-normal text-[11px] opacity-70 max-sm:hidden">
                {CAPTIONS[s.id]}
              </span>
            </button>
          );
        })}
      </div>
      {/* The slider: four stops, an amber line that grows to the open one, a round thumb you can drag. */}
      <div
        aria-hidden
        className="relative mt-1 h-8 cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) pick(e);
        }}
      >
        <div className="absolute inset-x-[12.5%] top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
        <div
          className="absolute top-1/2 left-[12.5%] h-1 -translate-y-1/2 rounded-full bg-[var(--active)] motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(.3,1.3,.5,1)]"
          style={{ width: `${(index / count) * 100}%` }}
        />
        {SECTIONS.map((s, i) => (
          <span
            key={s.id}
            className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${i <= index ? "bg-[var(--active)]" : "bg-border"}`}
            style={{ left: `${((i + 0.5) / count) * 100}%` }}
          />
        ))}
        <span
          className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--active)] bg-card shadow-[0_2px_10px_rgb(0_0_0/0.3)] motion-safe:transition-[left] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(.3,1.3,.5,1)]"
          style={{ left: `${((index + 0.5) / count) * 100}%` }}
        />
      </div>
    </div>
  );
}
