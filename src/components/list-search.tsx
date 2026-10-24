"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * The search box at the top of a list (Clients, Week's By project): a magnifier, one text box, and the label as both
 * its name and its placeholder. The list itself does the matching (`matchesAll` in lib/global-search.ts).
 */
export function ListSearch({
  label,
  value,
  onChange,
  className = "",
}: {
  /** "Search clients and projects": the box's name for screen readers, shown with "…" as its placeholder. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <search aria-label={label} className={`relative block ${className}`}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${label}…`}
        aria-label={label}
        className="h-11 pl-9 text-base"
      />
    </search>
  );
}
