"use client";

import { useState } from "react";

import { Archive, Pencil, Plus, X } from "lucide-react";

import { ClientLogoSlot } from "@/components/client-logo";
import { ICON_TONE, IconAction } from "@/components/icon-action";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/duration";

import { SetupForm } from "../../today/_components/setup-form";
import { ClientDetailsForm } from "./client-details-form";
import type { ClientRow, ProjectBudgets, ProjectTotals } from "./client-types";
import { ProjectCard, ProjectEditCard } from "./project-row";
import type { ProjectEditing } from "./use-project-editing";

/** One client: a plain heading with its buttons, the billing-details form when open, and its projects as cards. */
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
    <section aria-label={c.name} className="flex flex-col gap-3 border-t pt-4 first:border-t-0 first:pt-0">
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
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
        {/* Same pattern as Invoices and the project cards: icons with a tooltip on wide screens, icon over word on a phone. */}
        <span className="flex gap-1 max-sm:hidden">
          <IconAction label={`Add a project for ${c.name}`} tip="Add a project" onClick={() => setAdding(true)}>
            <Plus />
          </IconAction>
          <IconAction label={`Edit ${c.name} billing details`} tip="Billing details" onClick={onToggleBilling}>
            <Pencil className={ICON_TONE.edit} />
          </IconAction>
          <IconAction label={`Archive ${c.name}`} tip="Archive client" onClick={onArchiveClient}>
            <Archive className={ICON_TONE.archive} />
          </IconAction>
        </span>
        <div className="flex w-full gap-1.5 sm:hidden">
          <IconAction
            label={`Add a project for ${c.name}`}
            tip="Add a project"
            text="Add project"
            onClick={() => setAdding(true)}
          >
            <Plus />
          </IconAction>
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
      {billingOpen && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <ClientDetailsForm id={c.id} onDone={onCloseBilling} />
        </div>
      )}
      {/* The projects are the cards (one level under the page card); the + in the heading opens a dashed card to add another. */}
      {c.projects.length === 0 && !adding && (
        <p className="text-muted-foreground text-sm">No projects yet. Use the + above to add one.</p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {c.projects.map((p) =>
          editing.editingId === p.id ? (
            <ProjectEditCard key={p.id} project={p} clients={allClients} logos={logos} editing={editing} />
          ) : (
            <ProjectCard
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
        {adding ? (
          <li className="flex flex-col gap-2 rounded-xl border border-foreground/30 border-dashed p-3 sm:col-span-2">
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
          </li>
        ) : null}
      </ul>
    </section>
  );
}
