"use client";

import { useState } from "react";

import { Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESETS, presetRange } from "@/lib/export-range";

import type { InvoiceFilters, InvoiceSort, InvoiceStatusFilter } from "./use-invoice-filters";

const SELECT = "h-9 w-full min-w-0 rounded-lg border border-input bg-card px-2 text-sm max-md:h-10 dark:bg-input/30";

function SearchRow({
  filters,
  filtersOpen,
  onToggleFilters,
}: {
  filters: InvoiceFilters;
  filtersOpen: boolean;
  onToggleFilters: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.text}
          onChange={(e) => filters.setText(e.target.value)}
          placeholder="Search invoices…"
          aria-label="Search invoices"
          className="h-11 pr-10 pl-9 text-base"
        />
        {filters.text && (
          <button
            type="button"
            onClick={filters.clearSearch}
            aria-label="Clear search"
            title="Clear search"
            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-11 shrink-0 sm:hidden"
        aria-expanded={filtersOpen}
        aria-controls="invoice-filters"
        onClick={onToggleFilters}
      >
        <SlidersHorizontal /> Filters
        {filters.activeFilters > 0 && (
          <span className="rounded-full bg-primary px-1.5 font-medium text-primary-foreground text-xs">
            {filters.activeFilters}
          </span>
        )}
      </Button>
    </div>
  );
}

/** The "Issued:" quick picks; picking the one already on clears the dates. */
function IssuedPresets({ filters, today }: { filters: InvoiceFilters; today: string }) {
  return (
    <div className="col-span-2 flex flex-wrap items-center gap-1.5 sm:col-span-3 lg:col-span-5">
      <span className="text-muted-foreground text-xs">Issued:</span>
      {(["this-month", "last-month", "year-to-date"] as const).map((k) => {
        const r = presetRange(k, today);
        const on = filters.from === r.from && filters.to === r.to;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => {
              filters.setFrom(on ? "" : r.from);
              filters.setTo(on ? "" : r.to);
            }}
            className={`rounded-full border px-3 py-1 text-xs hover:bg-muted ${on ? "border-primary bg-tint" : ""}`}
          >
            {PRESETS.find((x) => x.key === k)?.label}
          </button>
        );
      })}
    </div>
  );
}

/** Labelled controls in a grid: two across on a phone (behind the Filters button), one row on a wide screen. */
function FilterFields({
  filters,
  clients,
  today,
  filtersOpen,
}: {
  filters: InvoiceFilters;
  clients: { id: string; name: string }[] | undefined;
  today: string | null;
  filtersOpen: boolean;
}) {
  return (
    <div
      id="invoice-filters"
      className={`grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 lg:grid-cols-5 ${filtersOpen ? "" : "max-sm:hidden"}`}
    >
      <div className="grid min-w-0 gap-1">
        <label htmlFor="inv-client" className="text-muted-foreground text-xs">
          Client
        </label>
        <select
          id="inv-client"
          value={filters.clientId}
          onChange={(e) => filters.setClientId(e.target.value)}
          className={SELECT}
        >
          <option value="">All clients</option>
          {clients?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid min-w-0 gap-1">
        <label htmlFor="inv-status" className="text-muted-foreground text-xs">
          Status
        </label>
        <select
          id="inv-status"
          value={filters.status}
          onChange={(e) => filters.setStatus(e.target.value as InvoiceStatusFilter)}
          className={SELECT}
        >
          <option value="all">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
        </select>
      </div>
      <div className="col-span-2 grid min-w-0 gap-1 sm:col-span-1">
        <label htmlFor="inv-sort" className="text-muted-foreground text-xs">
          Sort by
        </label>
        <select
          id="inv-sort"
          value={filters.sort}
          onChange={(e) => filters.setSort(e.target.value as InvoiceSort)}
          className={SELECT}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="highest">Highest amount</option>
          <option value="lowest">Lowest amount</option>
        </select>
      </div>
      <div className="grid min-w-0 gap-1">
        <label htmlFor="issued-from" className="text-muted-foreground text-xs">
          Issued from
        </label>
        <Input
          id="issued-from"
          type="date"
          value={filters.from}
          max={filters.to || undefined}
          onChange={(e) => filters.setFrom(e.target.value)}
          className="min-w-0 sm:h-9"
        />
      </div>
      <div className="grid min-w-0 gap-1">
        <label htmlFor="issued-to" className="text-muted-foreground text-xs">
          Issued to
        </label>
        <Input
          id="issued-to"
          type="date"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(e) => filters.setTo(e.target.value)}
          className="min-w-0 sm:h-9"
        />
      </div>
      {today && <IssuedPresets filters={filters} today={today} />}
    </div>
  );
}

/** Search box, the phone's Filters button, the filter fields and "Clear all filters". */
export function InvoiceFilterBar({
  filters,
  clients,
  today,
}: {
  filters: InvoiceFilters;
  clients: { id: string; name: string }[] | undefined;
  today: string | null;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false); // phones only: the filters start folded away
  return (
    <search aria-label="Find invoices" className="flex flex-col gap-3">
      <SearchRow filters={filters} filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen((o) => !o)} />
      <FilterFields filters={filters} clients={clients} today={today} filtersOpen={filtersOpen} />
      {(filters.filtering || filters.sort !== "newest") && (
        <div className="flex justify-end border-t pt-2">
          <Button variant="ghost" size="sm" onClick={filters.clearAll}>
            Clear all filters
          </Button>
        </div>
      )}
    </search>
  );
}
