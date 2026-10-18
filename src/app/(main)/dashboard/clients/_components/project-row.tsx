"use client";

import { Archive, Pencil } from "lucide-react";

import { LogoPicker } from "@/components/logo-picker";
import { ProjectMark } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/duration";

import type { ClientRow, ProjectRow as ProjectData, ProjectTotals } from "./client-types";
import type { ProjectEditing } from "./use-project-editing";

/** One project in its read-only form: name, rate, this month / all-time totals, edit and archive. */
export function ProjectRow({
  project: p,
  clientColor,
  logos,
  totals,
  onEdit,
  onArchive,
}: {
  project: ProjectData;
  clientColor: string;
  logos: Record<string, string>;
  totals: ProjectTotals | undefined;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-foreground/15 bg-card px-3 py-2 text-sm">
      <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 sm:flex-1">
        <ProjectMark projectId={p.id} color={clientColor} logos={logos} />
        <span className="font-medium">{p.name}</span>
        {p.hourly_rate > 0 ? (
          <span className="text-foreground/70">${(p.hourly_rate / 100).toFixed(2)}/h</span>
        ) : (
          p.billable && (
            <span className="text-destructive text-xs" title="Use the pencil to set an hourly rate">
              No hourly rate yet
            </span>
          )
        )}
        {!p.billable && <span className="text-foreground/70 text-xs">non-billable</span>}
      </span>
      <span className="flex items-center gap-3 font-mono text-[13px] text-foreground/75 tabular-nums sm:ml-auto">
        <span title="This month">{formatDuration(totals?.[p.id]?.range ?? 0)} mo</span>
        <span title="All time">{formatDuration(totals?.[p.id]?.total ?? 0)} total</span>
      </span>
      <span className="flex max-sm:ml-auto">
        <Button size="icon" variant="ghost" onClick={onEdit} aria-label={`Edit ${p.name}`}>
          <Pencil />
        </Button>
        <Button size="icon" variant="ghost" onClick={onArchive} aria-label={`Archive ${p.name}`}>
          <Archive />
        </Button>
      </span>
    </li>
  );
}

/** One project in its edit form: name, client, rate, billable, logo. */
export function ProjectEditRow({
  project: p,
  clients,
  logos,
  editing,
}: {
  project: ProjectData;
  clients: ClientRow[] | undefined;
  logos: Record<string, string>;
  editing: ProjectEditing;
}) {
  return (
    <li className="rounded-lg border border-foreground/15 bg-card px-3 py-3">
      <form method="post" onSubmit={(e) => editing.saveProject(e, p.id)} className="flex flex-wrap items-center gap-2">
        <Input name="name" defaultValue={p.name} required className="w-44" autoFocus />
        <select
          name="clientId"
          defaultValue={p.client_id}
          aria-label="Client"
          className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
        >
          {clients?.map((cl) => (
            <option key={cl.id} value={cl.id}>
              {cl.name}
            </option>
          ))}
        </select>
        <span className="flex items-center gap-1 text-muted-foreground text-sm">
          $
          <Input
            name="rate"
            type="number"
            min="0"
            step="0.01"
            defaultValue={(p.hourly_rate / 100).toFixed(2)}
            className="w-24"
            aria-label="Rate per hour"
          />
          /h
        </span>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="billable" defaultChecked={p.billable} /> Billable
        </label>
        <LogoPicker
          compact
          value={editing.logoDraft === undefined ? logos[p.id] : editing.logoDraft}
          onPick={editing.pickProjectLogo}
          onRemove={editing.removeLogoDraft}
          name="project logo"
        />
        <Button type="submit" size="sm" disabled={editing.isSaving}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={editing.stopEditing}>
          Cancel
        </Button>
      </form>
    </li>
  );
}
