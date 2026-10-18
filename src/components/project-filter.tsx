"use client";

import { useCallback, useState } from "react";

import { ChevronDown } from "lucide-react";

import { trpc } from "@/lib/trpc";

/**
 * Selected project for the Week/Month timesheets ("" = all projects). Mirrored to `?project=`
 * with replaceState so a filtered view is a shareable/bookmarkable link without a server round-trip.
 */
export function useProjectFilter(initial?: string) {
  const [projectId, setState] = useState(initial ?? "");
  const setProjectId = useCallback((id: string) => {
    setState(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("project", id);
    else url.searchParams.delete("project");
    window.history.replaceState(null, "", url);
  }, []);
  return [projectId, setProjectId] as const;
}

/** Clicking a row's name filters to that project; clicking the one already filtered clears the filter. */
export const toggleProjectFilter = (current: string, clicked: string) => (current === clicked ? "" : clicked);

export function ProjectFilter({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const clients = trpc.clients.list.useQuery();
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter by project"
        className="h-10 w-full appearance-none rounded-lg border border-input bg-transparent pr-8 pl-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        <option value="">All projects</option>
        {clients.data?.map((c) => (
          <optgroup key={c.id} label={c.name}>
            {c.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
