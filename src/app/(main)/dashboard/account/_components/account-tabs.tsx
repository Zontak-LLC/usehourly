"use client";

import { useEffect, useState } from "react";

import { Database, FileText, Sparkles, UserRound } from "lucide-react";

import { SECTIONS } from "./account-section";

type SectionId = (typeof SECTIONS)[number]["id"];

const ICONS = { account: UserRound, invoices: FileText, data: Database, ai: Sparkles } as const;

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

/** The tab strip: one section of the Account page at a time. Arrow keys move between tabs; on a phone the tabs wrap into pill buttons so none is hidden. */
export function AccountTabs({ tab, onTab }: { tab: SectionId; onTab: (next: SectionId) => void }) {
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = SECTIONS[(index + step + SECTIONS.length) % SECTIONS.length];
    onTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }
  return (
    <div role="tablist" aria-label="Account sections" className="grid grid-cols-4 gap-1.5 sm:flex sm:gap-1 sm:border-b">
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
            // Phone: four tiles in one row (icon over a short label), so nothing scrolls or hides. Wide: underline tabs.
            className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-center text-xs leading-tight transition-colors max-sm:rounded-xl max-sm:border sm:-mb-px sm:min-h-11 sm:flex-row sm:border-b-2 sm:px-3 sm:text-sm ${
              on
                ? "border-foreground/60 bg-tint font-medium text-foreground sm:border-foreground sm:bg-transparent"
                : "border-transparent text-muted-foreground hover:text-foreground max-sm:border-border max-sm:bg-card"
            }`}
          >
            <Icon className="size-5 sm:hidden" aria-hidden />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
