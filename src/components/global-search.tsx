"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ClearFieldButton } from "@/components/ui/clear-field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToggleTheme } from "@/components/use-toggle-theme";
import { formatDuration } from "@/lib/duration";
import {
  allPages,
  entryResults,
  groupResults,
  invoiceResults,
  matchClientsAndProjects,
  matchPagesAndSettings,
  type SearchResult,
} from "@/lib/global-search";
import { trpc } from "@/lib/trpc";

/** Waits `ms` after the last change before using a value (so typing does not ask the server for every letter). */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const OPEN_EVENT = "hourly:open-search";

/**
 * A box that looks like a text field and opens the site search. Used in the top bar (wide screens) and at the top of
 * the Account page. It is a button, not an input: the search itself lives in one panel, so there is only one search.
 */
export function SearchField({ placeholder, className = "" }: { placeholder: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Search"
      title="Search (Ctrl or Cmd + K)"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={`flex h-10 items-center gap-2 rounded-lg border bg-background px-3 text-left text-foreground/70 text-sm hover:bg-muted ${className}`}
    >
      <Search aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{placeholder}</span>
      <kbd className="hidden rounded border px-1.5 font-mono text-[11px] sm:inline">Ctrl K</kbd>
    </button>
  );
}

/**
 * The search in the top bar, on every signed-in page. One box finds pages, settings, clients, projects, time entries
 * and invoices; choosing a result goes straight there (a setting scrolls to its section, an entry opens its day).
 * Opens from the icon or with Ctrl/Cmd+K (not "/": Today uses that for its project search).
 */
export function GlobalSearch({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
  const toggleTheme = useToggleTheme();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);
  const typed = query.trim();
  const settled = useDebounced(typed, 250);
  const asking = open && settled.length >= 2;

  const clients = trpc.clients.list.useQuery(undefined, { enabled: open });
  const entries = trpc.entry.search.useQuery({ q: settled }, { enabled: asking });
  const invoices = trpc.invoice.list.useQuery({ q: settled }, { enabled: asking });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const groups = useMemo(() => {
    if (typed === "") return groupResults(allPages());
    const results: SearchResult[] = [
      ...matchPagesAndSettings(typed, { demo }),
      ...matchClientsAndProjects(typed, clients.data ?? []),
      ...(asking && settled === typed ? entryResults(entries.data ?? [], formatDuration) : []),
      ...(asking && settled === typed ? invoiceResults(invoices.data ?? []) : []),
    ];
    return groupResults(results);
  }, [typed, settled, asking, demo, clients.data, entries.data, invoices.data]);
  const flat = groups.flatMap((g) => g.items);
  const waiting = asking && (settled !== typed || entries.isFetching || invoices.isFetching);

  function go(result: SearchResult) {
    setOpen(false);
    setQuery("");
    if (result.action === "toggle-theme") {
      toggleTheme();
      return;
    }
    const [path, hash] = result.href.split("#");
    router.push(result.href);
    // Going to a part of the page we are already on does not start a navigation, so scroll there ourselves.
    if (hash && window.location.pathname === path) {
      setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      go(flat[active]);
    }
  }

  let index = -1;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Search"
        title="Search (Ctrl or Cmd + K)"
        onClick={() => setOpen(true)}
        className="xl:hidden"
      >
        <Search />
      </Button>
      <SearchField placeholder="Search everything…" className="hidden w-52 xl:flex" />
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <DialogContent className="top-[10%] flex max-h-[80vh] translate-y-0 flex-col gap-3 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Search</DialogTitle>
            <DialogDescription className="sr-only">
              Find pages, settings, clients, projects, time entries and invoices.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/60"
            />
            <input
              // biome-ignore lint/a11y/noAutofocus: the box opens in order to be typed in
              autoFocus
              ref={boxRef}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined}
              aria-label="Search pages, settings, clients, entries and invoices"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search: password, Acme, invoice maths, INV-2026…"
              className="h-11 w-full rounded-lg border bg-background pr-10 pl-9 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <ClearFieldButton
                className="inset-y-0 my-auto"
                onClear={() => {
                  setQuery("");
                  setActive(0);
                  boxRef.current?.focus();
                }}
              />
            )}
          </div>
          <div id={listId} role="listbox" aria-label="Results" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {groups.length === 0 ? (
              <p className="px-2 py-6 text-center text-foreground/70 text-sm">
                {waiting ? "Searching…" : `Nothing found for “${typed}”.`}
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.group} role="presentation" className="mb-2">
                  <p className="px-2 pt-2 pb-1 font-mono text-[11px] text-foreground/70 uppercase tracking-widest">
                    {g.group}
                  </p>
                  {g.items.map((r) => {
                    index += 1;
                    const i = index;
                    return (
                      <div
                        key={r.id}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={i === active}
                        tabIndex={-1}
                        onMouseMove={() => setActive(i)}
                        onClick={() => go(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") go(r);
                        }}
                        className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-lg px-3 py-1.5 ${
                          i === active ? "bg-muted" : ""
                        }`}
                      >
                        <span className="truncate font-medium text-sm">{r.title}</span>
                        {r.detail && <span className="truncate text-foreground/70 text-xs">{r.detail}</span>}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <p className="hidden text-foreground/60 text-xs sm:block">
            Up and down to move · Enter to open · Esc to close
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
