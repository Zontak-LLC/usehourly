"use client";

import { Archive, Building2, FolderKanban, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { SetupForm } from "../../today/_components/setup-form";
import { ClientDetailsForm } from "./client-details-form";
import type { ClientRow, ProjectTotals } from "./client-types";
import { ProjectEditRow, ProjectRow } from "./project-row";
import type { ProjectEditing } from "./use-project-editing";

/** One client: its header, the billing-details form when open, its projects and the add-a-project card. */
export function ClientCard({
  client: c,
  allClients,
  logos,
  totals,
  editing,
  billingOpen,
  onToggleBilling,
  onCloseBilling,
  onArchiveClient,
  onArchiveProject,
}: {
  client: ClientRow;
  allClients: ClientRow[] | undefined;
  logos: Record<string, string>;
  totals: ProjectTotals | undefined;
  editing: ProjectEditing;
  billingOpen: boolean;
  onToggleBilling: () => void;
  onCloseBilling: () => void;
  onArchiveClient: () => void;
  onArchiveProject: (project: { id: string; name: string }) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-l-4 bg-card" style={{ borderLeftColor: c.color }}>
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-semibold text-foreground/70 text-xs uppercase tracking-wider">
            <Building2 className="size-3.5" aria-hidden /> Client
          </p>
          <h2 className="truncate font-semibold text-lg">{c.name}</h2>
          <p className="text-foreground/70 text-sm">
            {c.projects.length} project{c.projects.length === 1 ? "" : "s"}
          </p>
        </div>
        <span className="flex max-sm:-ml-2.5">
          <Button size="sm" variant="ghost" onClick={onToggleBilling} aria-label={`Edit ${c.name} billing details`}>
            <Pencil /> Billing details
          </Button>
          <Button size="sm" variant="ghost" onClick={onArchiveClient}>
            <Archive /> Archive
          </Button>
        </span>
      </header>
      {billingOpen && <ClientDetailsForm id={c.id} onDone={onCloseBilling} />}
      <div className={`bg-muted/20 px-4 pt-3 pb-4 ${billingOpen ? "border-t" : ""}`}>
        <p className="mb-2 flex items-center gap-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
          <FolderKanban className="size-3.5" aria-hidden /> Projects
        </p>
        <ul className="flex flex-col gap-2">
          {c.projects.map((p) =>
            editing.editingId === p.id ? (
              <ProjectEditRow key={p.id} project={p} clients={allClients} logos={logos} editing={editing} />
            ) : (
              <ProjectRow
                key={p.id}
                project={p}
                clientColor={c.color}
                logos={logos}
                totals={totals}
                onEdit={() => editing.startEditing(p.id)}
                onArchive={() => onArchiveProject({ id: p.id, name: p.name })}
              />
            ),
          )}
        </ul>
        <div className="mt-3 rounded-lg border border-foreground/15 bg-card p-3">
          <p className="mb-2 flex items-center gap-1.5 font-semibold text-sm">
            <Plus className="size-4 text-primary" aria-hidden /> Add a project for {c.name}
          </p>
          <SetupForm clientId={c.id} />
        </div>
      </div>
    </section>
  );
}
