"use client";

import { useMemo, useState } from "react";

import { Check, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ALL_AS_CHIPS, chipProjects, type PickerProject, pushRecentId, searchProjects } from "@/lib/project-picker";

const RECENT_KEY = "hourly:recentProjects";
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
 * Pick one project. The project you are logging to is one large row (a dot in its client's colour, the name, the client
 * under it), so what is picked is never in doubt and nothing wraps. Your other projects are small one-line pills under
 * it, one tap to switch. Up to three projects are all shown; with more, the pills are the most recent ones and
 * "More…" opens a searchable list grouped by client, so the screen never fills up.
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

  // Picking a pill that is already showing must not shuffle the row: the projects shown at that moment stay put.
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
  const current = projects.find((p) => p.id === value) ?? chips[0];
  const others = chips.filter((p) => p.id !== current?.id);
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
      <div role="radiogroup" aria-labelledby="quick-project-label" className="flex flex-col gap-2">
        {current && (
          <Button
            type="button"
            role="radio"
            aria-checked="true"
            variant="outline"
            onClick={() => many && setOpen(true)}
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
        {(others.length > 0 || many) && (
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
            {many && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(true)}
                aria-label="Another project"
                className="h-9 rounded-full border-dashed px-3.5 text-muted-foreground"
              >
                <Search /> More…
              </Button>
            )}
          </div>
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
