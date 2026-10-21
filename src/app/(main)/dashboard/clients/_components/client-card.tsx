"use client";

import { useState } from "react";

import { Archive, ChevronDown, Pencil, Plus, X } from "lucide-react";

import { ClientLogoSlot } from "@/components/client-logo";
import { ClientCurrency } from "@/components/currency-provider";
import { IconAction } from "@/components/icon-action";
import { MoreMenu } from "@/components/more-menu";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/duration";

import { SetupForm } from "../../today/_components/setup-form";
import { ClientDetailsForm } from "./client-details-form";
import type { ClientRow, ProjectBudgets, ProjectTotals } from "./client-types";
import { ProjectCard, ProjectEditCard } from "./project-row";
import { PROJECTS_SHOWN } from "./use-open-clients";
import type { ProjectEditing } from "./use-project-editing";

/**
 * One client as a card: a tinted header (logo, name, summary, buttons), then its projects as tiles with a header of
 * their own. No lines anywhere: the tint and the spacing do the separating. The tiles have no border, so a card never
 * holds another framed card.
 */
export function ClientCard({
  client: c,
  allClients,
  logos,
  totals,
  budgets,
  editing,
  billingOpen,
  open: openByChoice,
  onOpenChange,
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
  /** Whether the person has this client open (closed shows just the one-line header). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleBilling: () => void;
  onCloseBilling: () => void;
  onArchiveClient: () => void;
  onArchiveProject: (project: { id: string; name: string }) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Something being edited or added here must be seen, so it opens the card whatever was chosen.
  const open = openByChoice || adding || billingOpen || c.projects.some((p) => editing.editingId === p.id);
  const bodyId = `client-body-${c.id}`;
  const hidden = showAll ? 0 : Math.max(0, c.projects.length - PROJECTS_SHOWN);
  const projects = hidden ? c.projects.slice(0, PROJECTS_SHOWN) : c.projects;
  const monthMinutes = c.projects.reduce((sum, p) => sum + (totals?.[p.id]?.range ?? 0), 0);
  return (
    <section aria-label={c.name} className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 bg-band-2 px-3 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ClientLogoSlot clientId={c.id} name={c.name} />
          {/* The whole name area opens and closes the card (the logo stays its own button, so this is not nested). */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => onOpenChange(!open)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-lg">{c.name}</span>
              <span className="block text-foreground/70 text-sm">
                {c.projects.length} project{c.projects.length === 1 ? "" : "s"} · {formatDuration(monthMinutes)} this
                month
              </span>
            </span>
            <ChevronDown
              className={`size-5 shrink-0 text-foreground/60 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        </div>
        {/* The common action stays visible; billing details and archive sit behind the ··· menu (docs/ui-spec.md). */}
        <span className="flex gap-1">
          <IconAction
            label={`Add a project for ${c.name}`}
            tip="Add a project"
            expanded={adding}
            onClick={() => setAdding((now) => !now)}
          >
            <Plus />
          </IconAction>
          <MoreMenu
            label={`More actions for ${c.name}`}
            items={[
              {
                label: billingOpen ? "Close billing details" : "Billing details",
                icon: <Pencil />,
                onSelect: onToggleBilling,
              },
              { label: "Archive client", icon: <Archive />, onSelect: onArchiveClient, destructive: true },
            ]}
          />
        </span>
      </header>
      <ClientCurrency currency={c.currency}>
        <div id={bodyId} hidden={!open} className="flex flex-col gap-3 p-3">
          {billingOpen && (
            <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
              <ClientDetailsForm id={c.id} onDone={onCloseBilling} />
            </div>
          )}
          {c.projects.length === 0 && !adding && (
            <p className="text-muted-foreground text-sm">No projects yet. Add the first one below.</p>
          )}
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) =>
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
              <li className="flex flex-col gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10 sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 font-semibold text-sm">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-tint text-foreground">
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
                <SetupForm
                  clientId={c.id}
                  bar
                  onDone={() => {
                    setAdding(false);
                    // A client that started open because it had one project must not fold up when it gets a second.
                    onOpenChange(true);
                  }}
                  onCancel={() => setAdding(false)}
                />
              </li>
            ) : c.projects.length === 0 ? (
              // Only a client with no project yet gets the big dashed card; once it has one, the + in the header is enough.
              <li className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  aria-label={`Add a project for ${c.name}`}
                  className="flex h-full min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-foreground/30 border-dashed p-3 text-muted-foreground text-sm transition-colors hover:border-foreground/50 hover:bg-muted/60 hover:text-foreground"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted">
                    <Plus className="size-4" aria-hidden />
                  </span>
                  Add a project
                </button>
              </li>
            ) : null}
          </ul>
          {(hidden > 0 || (showAll && c.projects.length > PROJECTS_SHOWN)) && (
            <Button type="button" variant="outline" className="self-start" onClick={() => setShowAll((all) => !all)}>
              {showAll ? "Show fewer projects" : `Show all ${c.projects.length} projects`}
            </Button>
          )}
        </div>
      </ClientCurrency>
    </section>
  );
}
