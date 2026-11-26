"use client";

import { type ComponentProps, useEffect, useId, useState } from "react";

import { ChevronDown } from "lucide-react";

import { safe } from "@/components/support-notice";
import { WorkItems } from "@/components/work-items";
import { countEntryDays } from "@/lib/work-items";

const OPEN_KEY = "hourly:weekEntriesOpen";

/**
 * The week's full list under the day panel. A week whose time is on one day shows nothing (the day panel already has
 * it all); otherwise the list sits behind one row, and this device remembers whether it was left open.
 */
export function WeekAllEntries(props: Omit<ComponentProps<typeof WorkItems>, "period" | "editInPlace">) {
  const listId = useId();
  // Folded on the first paint so the server and client markup match; the saved choice is read after mount.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(safe(() => localStorage.getItem(OPEN_KEY) === "1", false));
  }, []);

  if (countEntryDays(props.entries) < 2) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    safe(() => localStorage.setItem(OPEN_KEY, next ? "1" : "0"), undefined);
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-3xl border bg-band-2 px-3 py-3 text-left font-semibold text-base shadow-[var(--shadow-sheet)] sm:px-4"
      >
        All {props.entries.length} entries this week
        <ChevronDown aria-hidden className={`size-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div id={listId}>{open && <WorkItems {...props} period="week" editInPlace />}</div>
    </div>
  );
}
