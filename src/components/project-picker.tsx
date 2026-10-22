"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Check, Search } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { ProjectList } from "@/components/project-list";
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

/** Remember that `id` was just used, so it shows up first next time. */
export function rememberRecentProject(id: string) {
  writeIds(RECENT_KEY, pushRecentId(readIds(RECENT_KEY), id));
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
 * Pick one project. The project you are logging to is one large row; your pinned and recent projects are one-tap pills
 * under it; and with more than three projects a search field takes the place of "More…": type two letters (or press /
 * from anywhere), use the arrow keys, press Enter. The list drops down under the field on a computer and opens at the
 * top of the screen on a phone. A star on any row pins it as a pill.
 */
export function ProjectPicker({
  projects,
  value,
  onChange,
  onPicked,
}: {
  projects: PickerProject[];
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
  const field = useRef<HTMLInputElement>(null);
  const phone = useIsPhone();
  const listId = useId();

  // Picking a pill that is already showing must not shuffle the row: the projects shown at that moment stay put.
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const many = projects.length > ALL_AS_CHIPS;
  const computed = chipProjects(projects, recent, value, pins);
  const frozenChips = frozen
    ? frozen.map((id) => projects.find((p) => p.id === id)).filter((p): p is PickerProject => !!p)
    : [];
  const chips =
    many && frozenChips.length === computed.length && frozenChips.some((p) => p.id === value) ? frozenChips : computed;
  const current = projects.find((p) => p.id === value) ?? chips[0];
  const others = chips.filter((p) => p.id !== current?.id);
  const { sections, flat } = useMemo(() => pickerRows(projects, query, recent), [projects, query, recent]);

  function choose(id: string, fromSearch = false) {
    setFrozen(chips.some((p) => p.id === id) ? chips.map((p) => p.id) : null);
    onChange(id);
    setRecent(pushRecentId(recent, id));
    setOpen(false);
    setQuery("");
    setActive(0);
    if (fromSearch) onPicked?.();
  }

  function togglePin(id: string) {
    const next = togglePinnedId(pins, id);
    setPins(next);
    writeIds(PINNED_KEY, next);
    setFrozen(null);
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
      field.current?.focus();
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

  return (
    <>
      <div role="radiogroup" aria-labelledby="quick-project-label" className="flex flex-col gap-2">
        {current && (
          <Button
            type="button"
            role="radio"
            aria-checked="true"
            variant="outline"
            onClick={() => many && (phone ? setOpen(true) : field.current?.focus())}
            title={many ? "Choose another project" : undefined}
            className="h-auto w-full justify-start gap-3 whitespace-normal rounded-2xl border-2 border-foreground bg-card px-4 py-3 text-left hover:bg-card"
          >
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: current.color ?? "var(--foreground)" }}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-bold font-display text-lg leading-tight">{current.name}</span>
              <span className="truncate text-muted-foreground text-sm">{current.clientName}</span>
            </span>
            <Check className="size-5 shrink-0" aria-hidden strokeWidth={2.5} />
          </Button>
        )}
        {others.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {others.map((p) => (
              <Button
                key={p.id}
                type="button"
                role="radio"
                aria-checked="false"
                variant="outline"
                title={`${p.name} · ${p.clientName}`}
                onClick={() => choose(p.id)}
                className="h-9 max-w-full gap-2 rounded-full px-3.5"
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color ?? "var(--muted-foreground)" }}
                />
                <span className="truncate font-medium">{p.name}</span>
              </Button>
            ))}
          </div>
        )}
        {many && !phone && (
          <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
            <PopoverPrimitive.Anchor asChild>
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  ref={field}
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-activedescendant={open && flat[active] ? `${listId}-${active}` : undefined}
                  aria-label="Search projects or clients"
                  autoComplete="off"
                  value={query}
                  placeholder={`Search ${projects.length} projects or clients…`}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                  onKeyDown={onKeyDown}
                  className="h-11 rounded-full pr-10 pl-9"
                />
                <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground md:block">
                  /
                </kbd>
              </div>
            </PopoverPrimitive.Anchor>
            <PopoverContent
              align="start"
              className="max-h-80 w-[min(28rem,calc(100vw-2rem))] overflow-y-auto p-0"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                if (field.current?.contains(e.target as Node)) e.preventDefault();
              }}
            >
              {list}
            </PopoverContent>
          </PopoverPrimitive.Root>
        )}
        {many && phone && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
            aria-label="Search projects or clients"
            className="h-11 justify-start gap-2 rounded-full px-4 font-normal text-muted-foreground"
          >
            <Search /> Search {projects.length} projects or clients…
          </Button>
        )}
      </div>

      {many && phone && (
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setQuery("");
          }}
        >
          <DialogContent className="flex max-h-[80vh] flex-col gap-3 sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Choose a project</DialogTitle>
              <DialogDescription className="sr-only">Search by project or client name.</DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                autoFocus
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search projects or clients…"
                aria-label="Search projects or clients"
                className="pl-8"
              />
            </div>
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{list}</div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
