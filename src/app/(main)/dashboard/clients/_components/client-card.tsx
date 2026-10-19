"use client";

import { useState } from "react";

import { Archive, FolderKanban, Pencil, Plus, X } from "lucide-react";

import { ClientLogoSlot } from "@/components/client-logo";
import { ICON_TONE, IconAction } from "@/components/icon-action";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/duration";

import { SetupForm } from "../../today/_components/setup-form";
import { ClientDetailsForm } from "./client-details-form";
import type { ClientRow, ProjectBudgets, ProjectTotals } from "./client-types";
import { PROJECT_GRID, ProjectEditRow, ProjectRow } from "./project-row";
import type { ProjectEditing } from "./use-project-editing";

/** One client: its header, the billing-details form when open, its projects and the add-a-project card. */
export function ClientCard({
  client: c,
  allClients,
  logos,
  totals,
  budgets,
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
  budgets: ProjectBudgets | undefined;
  editing: ProjectEditing;
  billingOpen: boolean;
  onToggleBilling: () => void;
  onCloseBilling: () => void;
  onArchiveClient: () => void;
  onArchiveProject: (project: { id: string; name: string }) => void;
}) {
  const [adding, setAdding] = useState(false);
  const monthMinutes = c.projects.reduce((sum, p) => sum + (totals?.[p.id]?.range ?? 0), 0);
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b bg-muted/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ClientLogoSlot clientId={c.id} name={c.name} />
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-lg">{c.name}</h2>
            <p className="text-foreground/70 text-sm">
              {c.projects.length} project{c.projects.length === 1 ? "" : "s"} · {formatDuration(monthMinutes)} this
              month
            </p>
          </div>
        </div>
        {/* Same pattern as Invoices and the project rows: icons with a tooltip on wide screens, icon over word on a phone. */}
        <span className="flex gap-1 max-sm:hidden">
          <IconAction label={`Edit ${c.name} billing details`} tip="Billing details" onClick={onToggleBilling}>
            <Pencil className={ICON_TONE.edit} />
          </IconAction>
          <IconAction label={`Archive ${c.name}`} tip="Archive client" onClick={onArchiveClient}>
            <Archive className={ICON_TONE.archive} />
          </IconAction>
        </span>
        <div className="flex w-full gap-1.5 sm:hidden">
          <IconAction
            label={`Edit ${c.name} billing details`}
            tip="Billing details"
            text="Billing details"
            onClick={onToggleBilling}
          >
            <Pencil className={ICON_TONE.edit} />
          </IconAction>
          <IconAction label={`Archive ${c.name}`} tip="Archive client" text="Archive" onClick={onArchiveClient}>
            <Archive className={ICON_TONE.archive} />
          </IconAction>
        </div>
      </header>
      {billingOpen && <ClientDetailsForm id={c.id} onDone={onCloseBilling} />}
      <div className={`bg-muted/20 px-4 pt-3 pb-4 ${billingOpen ? "border-t" : ""}`}>
        <div
          className={`mb-1 grid grid-cols-[minmax(0,1fr)] gap-x-3 px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider ${PROJECT_GRID}`}
        >
          <span className="flex items-center gap-1">
            <FolderKanban className="size-3.5" aria-hidden /> Projects
          </span>
          <span className="max-sm:hidden">Rate</span>
          <span className="text-right max-sm:hidden">This month</span>
          <span className="text-right max-sm:hidden">All time</span>
          <span className="max-sm:hidden" />
        </div>
        <ul className="divide-y">
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
                budget={budgets?.[p.id]}
                onEdit={() => editing.startEditing(p.id)}
                onArchive={() => onArchiveProject({ id: p.id, name: p.name })}
              />
            ),
          )}
        </ul>
        {/* Collapsed to one button so a card with many clients stays short; a plain section, since cards go one level deep. */}
        {adding ? (
          <div className="mt-3 flex flex-col gap-2 border-foreground/30 border-t border-dashed pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5 font-semibold text-sm">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-foreground">
                  <Plus className="size-3.5" aria-hidden />
                </span>
                <span className="truncate">Add a project for {c.name}</span>
              </p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-10 shrink-0"
                onClick={() => setAdding(false)}
                aria-label="Cancel"
              >
                <X />
              </Button>
            </div>
            <SetupForm clientId={c.id} bar onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="mt-2 h-10 w-full justify-start"
            onClick={() => setAdding(true)}
          >
            <Plus /> Add a project
          </Button>
        )}
      </div>
    </section>
  );
}
