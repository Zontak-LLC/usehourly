"use client";

import type { MouseEvent } from "react";

import { Search } from "lucide-react";

import { ClientInitial } from "@/components/client-initial";
import { Input } from "@/components/ui/input";
import { clientPath } from "@/lib/client-list";

import type { ClientRow } from "./client-types";

export type ListItem = {
  client: ClientRow;
  /** The line under the name: "4:15 this month", "quiet for 3 weeks". */
  line: string;
  /** What is waiting to be billed, written in the client's currency (only in "To bill"). */
  amount?: string;
  quiet?: boolean;
};

/**
 * The left half of the split view: a search, then "To bill · N" (each client with its amount) and "All billed up · N".
 * Each row is a real link to the client's own address (so it opens in a new tab and works without script); a plain
 * click selects it in place, keeping the search and the scroll.
 */
export function ClientListPane({
  toBill,
  billed,
  selectedId,
  search,
  onSearch,
  showSearch,
  onOpen,
}: {
  toBill: ListItem[];
  billed: ListItem[];
  selectedId: string | null;
  search: string;
  onSearch: (value: string) => void;
  showSearch: boolean;
  onOpen: (id: string) => void;
}) {
  const nothing = toBill.length + billed.length === 0;
  return (
    <div className="flex flex-col gap-1 p-2">
      {showSearch && (
        <search aria-label="Find clients and projects" className="relative mb-1 block">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search clients and projects…"
            aria-label="Search clients and projects"
            className="h-11 pl-9 text-base"
          />
        </search>
      )}
      {nothing && search && (
        <p className="px-2 py-4 text-center text-muted-foreground text-sm">No client or project matches that.</p>
      )}
      <Group title="To bill" items={toBill} selectedId={selectedId} onOpen={onOpen} />
      <Group title="All billed up" items={billed} selectedId={selectedId} onOpen={onOpen} />
    </div>
  );
}

function Group({
  title,
  items,
  selectedId,
  onOpen,
}: {
  title: string;
  items: ListItem[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const id = `clients-group-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <>
      <p
        id={id}
        className="px-2 pt-2 pb-1 font-mono font-semibold text-[10.5px] text-foreground/70 uppercase tracking-wider"
      >
        {title} · {items.length}
      </p>
      <ul aria-labelledby={id} className="flex flex-col gap-0.5" data-testid={`${id}`}>
        {items.map((item) => (
          <li key={item.client.id}>
            <Row item={item} selected={item.client.id === selectedId} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Row({ item, selected, onOpen }: { item: ListItem; selected: boolean; onOpen: (id: string) => void }) {
  const { client: c } = item;
  function click(e: MouseEvent<HTMLAnchorElement>) {
    // A new tab or window (Ctrl, Cmd, Shift, middle click) is the browser's job.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onOpen(c.id);
  }
  return (
    <a
      href={clientPath(c.id)}
      onClick={click}
      aria-current={selected ? "page" : undefined}
      className={`grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 text-left ${
        selected ? "bg-card shadow-sm ring-1 ring-foreground/15" : "hover:bg-card/70"
      }`}
    >
      <ClientInitial name={c.name} colour={c.color} quiet={item.quiet} />
      <span className="min-w-0">
        <span className={`block truncate text-sm ${item.quiet ? "font-medium text-foreground/80" : "font-semibold"}`}>
          {c.name}
        </span>
        <span className="block truncate text-foreground/70 text-xs">{item.line}</span>
      </span>
      {item.amount && (
        <span className="font-mono font-semibold text-[13px] tabular-nums tracking-tight">{item.amount}</span>
      )}
    </a>
  );
}
