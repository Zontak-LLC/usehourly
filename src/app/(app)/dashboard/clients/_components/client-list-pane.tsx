"use client";

import { ClientInitial } from "@/components/client-initial";
import { ListSearch } from "@/components/list-search";
import { SplitGroup, SplitRow } from "@/components/split-view";
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
        <ListSearch label="Search clients and projects" value={search} onChange={onSearch} className="mb-1" />
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
  return (
    <SplitGroup id={`clients-group-${title.replace(/\s+/g, "-").toLowerCase()}`} title={`${title} · ${items.length}`}>
      {items.map((item) => (
        <li key={item.client.id}>
          <Row item={item} selected={item.client.id === selectedId} onOpen={onOpen} />
        </li>
      ))}
    </SplitGroup>
  );
}

function Row({ item, selected, onOpen }: { item: ListItem; selected: boolean; onOpen: (id: string) => void }) {
  const { client: c } = item;
  return (
    <SplitRow
      href={clientPath(c.id)}
      selected={selected}
      onOpen={() => onOpen(c.id)}
      leading={<ClientInitial name={c.name} colour={c.color} quiet={item.quiet} />}
      title={c.name}
      line={item.line}
      quiet={item.quiet}
      trailing={
        item.amount && (
          <span className="font-mono font-semibold text-[13px] tabular-nums tracking-tight">{item.amount}</span>
        )
      }
    />
  );
}
