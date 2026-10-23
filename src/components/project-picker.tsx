"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Check, Search } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { ProjectList } from "@/components/project-list";
import { halo } from "@/components/time-reward";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PopoverContent } from "@/components/ui/popover";
import {
  ALL_AS_CHIPS,
  chipProjects,
  type PickerProject,
  pickerRows,
  pushRecentId,
  togglePinnedId,
} from "@/lib/project-picker";

const RECENT_KEY = "hourly:recentProjects";
const PINNED_KEY = "hourly:pinnedProjects";

function readIds(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Remembering is a convenience; ignore storage being unavailable.
  }
}

/** A phone has an on-screen keyboard that would cover a list under the field, so there the search opens at the top. */
function useIsPhone() {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia("(max-width: 639px)");
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia("(max-width: 639px)").matches,
    () => false,
  );
}

/**
 * Pick one project, as one row of pills (2026-10-23 redesign: the big "you are logging to" row is gone). The picked pill
 * is filled in its client's colour and gives a halo when picked. Up to five projects are all pills; from six, your
 * pinned and recent ones are pills in an order that stays put while the page is open, and "More…" opens the search
 * (type two letters, or press / from anywhere, use the arrow keys, press Enter): it drops down on a computer and opens
 * at the top of the screen on a phone. A star on any row of the search pins it as a pill.
 */
export function ProjectPicker({
  projects,
  value,
  onChange,
  onPicked,
  labelledBy,
}: {
  projects: PickerProject[];
  /** The id of the words that name the row ("on"). */
  labelledBy?: string;
  value: string;
  onChange: (id: string) => void;
  /** Called after a project was picked from the search (the form uses it to move on to the time box). */
  onPicked?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => (typeof window === "undefined" ? [] : readIds(RECENT_KEY)));
  const [pins, setPins] = useState<string[]>(() => (typeof window === "undefined" ? [] : readIds(PINNED_KEY)));
  // A pick from the search hands the focus to the time box once the search has closed (not back to "More…").
  const pickedFromSearch = useRef(false);
  const pillsRef = useRef<HTMLDivElement>(null);
  const phone = useIsPhone();
  const listId = useId();

  // The pills are worked out from what was remembered when the page opened (and the pins), never from what is picked
  // now: picking a pill only presses it, so nothing moves under the pointer. New recent projects show from the next visit.
  const [recentAtLoad] = useState(recent);
  const many = projects.length > ALL_AS_CHIPS;
  const chips = useMemo(() => chipProjects(projects, recentAtLoad, pins), [projects, recentAtLoad, pins]);
  const current = projects.find((p) => p.id === value) ?? chips[0];
  // A project picked from the search that is not a pill yet shows as the first pill, so the choice is always visible.
  const pills = current && !chips.some((p) => p.id === current.id) ? [current, ...chips.slice(0, -1)] : chips;
  const { sections, flat } = useMemo(() => pickerRows(projects, query, recent), [projects, query, recent]);

  function choose(id: string, fromSearch = false, from?: HTMLElement) {
    onChange(id);
    const colour = projects.find((p) => p.id === id)?.color;
    if (from && colour) halo(from, colour);
    // Remembered for the search list now and for the pills on the next visit (they never move during this one).
    const next = pushRecentId(recent, id);
    setRecent(next);
    writeIds(RECENT_KEY, next);
    setOpen(false);
    setQuery("");
    setActive(0);
    pickedFromSearch.current = fromSearch;
  }

  /** When the search closes: after a pick, on to the time box; otherwise the focus goes back to "More…" as usual. */
  function onCloseAutoFocus(e: Event) {
    if (!pickedFromSearch.current) return;
    pickedFromSearch.current = false;
    e.preventDefault();
    onPicked?.();
  }

  /** The pills are one radio group: one Tab stop, and the arrow keys move to the next project and pick it. */
  function onPillsKeyDown(e: React.KeyboardEvent) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const at = pills.findIndex((p) => p.id === current?.id);
    const next = (at + step + pills.length) % pills.length;
    choose(pills[next].id);
    pillsRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  }

  function togglePin(id: string) {
    const next = togglePinnedId(pins, id);
    setPins(next);
    writeIds(PINNED_KEY, next);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.max(0, Math.min(flat.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && open && flat[active]) {
      e.preventDefault();
      choose(flat[active].id, true);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  // "/" from anywhere on the page jumps to the search (unless a field is being typed in).
  useEffect(() => {
    if (!many || phone) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.matches("input, textarea, select") || t.isContentEditable)) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [many, phone]);

  const list = (
    <ProjectList
      sections={sections}
      query={query}
      active={active}
      value={value}
      pinned={pins}
      listId={listId}
      onActive={setActive}
      onChoose={(id) => choose(id, true)}
      onTogglePin={togglePin}
    />
  );

  const pillClass =
    "h-9 max-w-full gap-2 rounded-full px-3.5 transition-[background-color,box-shadow] aria-checked:font-semibold";
  const more = (
    <Button
      type="button"
      variant="ghost"
      aria-label="Search projects or clients"
      aria-expanded={open}
      // On a computer the popover's own trigger opens and closes it; on a phone this opens the dialog.
      onClick={phone ? () => setOpen(true) : undefined}
      className="h-9 gap-1.5 rounded-full px-3 text-muted-foreground"
    >
      <Search className="size-4" aria-hidden />
      More…
    </Button>
  );
  const search = (autoFocus: boolean) => (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined}
        aria-label="Search projects or clients"
        autoComplete="off"
        clearable
        value={query}
        placeholder={`Search ${projects.length} projects or clients…`}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="h-10 rounded-full pl-9"
      />
    </div>
  );

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div
          ref={pillsRef}
          role="radiogroup"
          aria-labelledby={labelledBy}
          onKeyDown={onPillsKeyDown}
          className="contents"
        >
          {pills.map((p) => {
            const on = p.id === current?.id;
            const colour = p.color ?? "var(--foreground)";
            return (
              <Button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                variant="outline"
                title={`${p.name} · ${p.clientName}`}
                onClick={(e) => choose(p.id, false, e.currentTarget)}
                className={pillClass}
                style={
                  on
                    ? {
                        backgroundColor: `color-mix(in oklab, ${colour} 14%, var(--card))`,
                        borderColor: colour,
                        boxShadow: `inset 0 0 0 1px ${colour}`,
                      }
                    : undefined
                }
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colour }}
                />
                <span className="truncate font-medium">{p.name}</span>
                {on && <Check className="size-3.5 shrink-0" strokeWidth={3} aria-hidden />}
              </Button>
            );
          })}
        </div>
        {many && !phone && (
          <PopoverPrimitive.Root
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) setQuery("");
            }}
          >
            <PopoverPrimitive.Trigger asChild>{more}</PopoverPrimitive.Trigger>
            <PopoverContent
              align="start"
              onCloseAutoFocus={onCloseAutoFocus}
              className="flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-2 p-2"
            >
              {search(true)}
              <div className="max-h-72 overflow-y-auto">{list}</div>
            </PopoverContent>
          </PopoverPrimitive.Root>
        )}
        {many && phone && more}
      </div>

      {many && phone && (
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setQuery("");
          }}
        >
          <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="flex max-h-[80vh] flex-col gap-3 sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Choose a project</DialogTitle>
              <DialogDescription className="sr-only">Search by project or client name.</DialogDescription>
            </DialogHeader>
            {search(true)}
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{list}</div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
