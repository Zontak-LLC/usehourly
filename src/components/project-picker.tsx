"use client";

import { useMemo, useState } from "react";

import { Check, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ALL_AS_CHIPS, chipProjects, type PickerProject, pushRecentId, searchProjects } from "@/lib/project-picker";

const RECENT_KEY = "hourly:recentProjects";
/** One row, never wrapped, when every project is a chip; full class names so Tailwind keeps them. */
const CHIP_COLUMNS: Record<number, string> = {
  2: "grid grid-cols-2",
  3: "grid grid-cols-3",
  4: "grid grid-cols-4",
};
/** With more projects: the three chips share the row equally and the search button takes only what it needs. */
const MANY_COLUMNS = "grid grid-cols-[repeat(3,minmax(0,1fr))_auto]";

const many_ = (projects: PickerProject[]) => projects.length > ALL_AS_CHIPS;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Remember that `id` was just used, so it shows up first next time. */
export function rememberRecentProject(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(pushRecentId(readRecent(), id)));
  } catch {
    // Remembering is a convenience; ignore storage being unavailable.
  }
}

/**
 * Pick one project. Up to three projects are all shown as chips. With more, the chips are the selected project and the
 * most recent ones, and "All projects" opens a searchable list grouped by client, so the screen never fills up.
 */
export function ProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: PickerProject[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() => (typeof window === "undefined" ? [] : readRecent()));

  // Picking a chip that is already showing must not shuffle the row: the chips shown at that moment stay put.
  const [pinned, setPinned] = useState<string[] | null>(null);
  const computed = chipProjects(projects, recent, value);
  const pinnedChips = pinned
    ? pinned.map((id) => projects.find((p) => p.id === id)).filter((p): p is PickerProject => !!p)
    : [];
  const chips =
    many_(projects) && pinnedChips.length === computed.length && pinnedChips.some((p) => p.id === value)
      ? pinnedChips
      : computed;
  const many = projects.length > ALL_AS_CHIPS;
  // Names that appear twice need their client next to them on the narrow chips.
  const sameName = new Set(projects.map((p) => p.name).filter((n, i, all) => all.indexOf(n) !== i));
  const results = useMemo(() => searchProjects(projects, query), [projects, query]);
  const first = results[0];

  function choose(id: string) {
    setPinned(chips.some((p) => p.id === id) ? chips.map((p) => p.id) : null);
    onChange(id);
    setRecent(pushRecentId(recent, id));
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <div
        role="radiogroup"
        aria-labelledby="quick-project-label"
        className={`flex flex-wrap gap-2 ${many ? MANY_COLUMNS : (CHIP_COLUMNS[projects.length] ?? "")}`}
      >
        {chips.map((p) => {
          const on = value === p.id;
          return (
            <Button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              variant="outline"
              onClick={() => choose(p.id)}
              className={`h-auto justify-start gap-2.5 whitespace-normal px-3 py-2 text-left max-sm:min-h-10 max-sm:min-w-0 max-sm:justify-center max-sm:gap-1.5 max-sm:rounded-full max-sm:px-3.5 max-sm:py-1.5 sm:min-h-12 ${on ? "border-foreground/60 bg-card ring-1 ring-foreground/30" : ""}`}
            >
              <span
                aria-hidden="true"
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 max-sm:size-4 ${on ? "" : "max-sm:hidden"} ${on ? "border-foreground bg-foreground text-background" : "border-muted-foreground/50"}`}
              >
                {on && <Check className="size-3.5 text-background max-sm:size-3" strokeWidth={3} />}
              </span>
              <span className="flex min-w-0 flex-col items-start max-sm:items-center">
                <span className="max-w-full break-words font-medium max-sm:truncate sm:text-base" title={p.name}>
                  {p.name}
                </span>
                <span
                  className={`max-w-full break-words font-normal text-xs max-sm:truncate ${sameName.has(p.name) ? "" : "max-sm:hidden"} ${
                    on ? "text-foreground/75" : "text-muted-foreground"
                  }`}
                >
                  {p.clientName}
                </span>
              </span>
            </Button>
          );
        })}
        {many && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
            aria-label="Another project"
            className="h-auto border-dashed text-muted-foreground max-sm:min-h-10 max-sm:rounded-full max-sm:px-3.5 max-sm:py-1.5 sm:min-h-12"
          >
            <Search /> <span className="max-sm:sr-only">Another project…</span>
          </Button>
        )}
      </div>

      {many && (
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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && first) {
                    e.preventDefault();
                    choose(first.id);
                  }
                }}
                placeholder="Search projects or clients…"
                aria-label="Search projects or clients"
                className="pl-8"
              />
            </div>
            <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1">
              {results.length === 0 && (
                <p className="py-6 text-center text-muted-foreground text-sm">No project matches that.</p>
              )}
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choose(p.id)}
                  aria-current={value === p.id ? "true" : undefined}
                  className="flex min-h-14 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left hover:bg-muted aria-[current=true]:border-foreground/60 aria-[current=true]:bg-card aria-[current=true]:ring-1 aria-[current=true]:ring-foreground/30"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-sm">{p.name}</span>
                    <span className="block truncate text-muted-foreground text-xs">{p.clientName}</span>
                  </span>
                  {value === p.id && <Check className="size-4 shrink-0" aria-hidden />}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
