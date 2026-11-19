"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { SetupForm } from "../../today/_components/setup-form";
import type { ClientRow, ProjectBudgets, ProjectTotals } from "./client-types";
import { PROJECT_COLS, ProjectEditCard, ProjectLine } from "./project-row";
import type { ProjectEditing } from "./use-project-editing";

/**
 * The Projects tab of a client's profile: the projects as rows of one table (dot, name, rate, this month, all time, one
 * Edit), then "Add a project", which opens the new-project form in place.
 */
export function ProfileProjects({
  client: c,
  allClients,
  logos,
  totals,
  budgets,
  editing,
  adding,
  onAddingChange,
  onArchiveProject,
}: {
  client: ClientRow;
  allClients: ClientRow[] | undefined;
  logos: Record<string, string>;
  totals: ProjectTotals | undefined;
  budgets: ProjectBudgets | undefined;
  editing: ProjectEditing;
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  onArchiveProject: (project: { id: string; name: string }) => void;
}) {
  const editingHere = c.projects.some((p) => editing.editingId === p.id);
  return (
    <div className="flex flex-col">
      {c.projects.length > 0 && !editingHere && (
        // Column titles (wide screens), the same columns as every row below.
        <div
          className={`${PROJECT_COLS} gap-x-3 px-3 pb-1.5 font-mono text-[10.5px] text-foreground/60 uppercase tracking-wider max-sm:hidden`}
          aria-hidden
        >
          <span>Project</span>
          <span className="text-right">Rate</span>
          <span className="text-right">This month</span>
          <span className="text-right">All time</span>
          <span />
        </div>
      )}

      <ul className="empty:hidden">
        {c.projects.map((p) =>
          editing.editingId === p.id ? (
            <ProjectEditCard
              key={p.id}
              project={p}
              clients={allClients}
              logos={logos}
              editing={editing}
              onArchive={() => onArchiveProject({ id: p.id, name: p.name })}
            />
          ) : (
            <ProjectLine
              key={p.id}
              project={p}
              clientColor={c.color}
              totals={totals}
              budget={budgets?.[p.id]}
              onEdit={() => editing.startEditing(p.id)}
            />
          ),
        )}
      </ul>

      {c.projects.length === 0 && !adding && (
        <p className="px-3 py-3 text-foreground/70 text-sm">
          No projects yet. Use <span className="font-medium text-foreground">Add a project</span> to start logging time
          for {c.name}.
        </p>
      )}

      {adding ? (
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-muted/60 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-semibold text-sm">New project for {c.name}</p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-10 shrink-0"
              onClick={() => onAddingChange(false)}
              aria-label="Cancel"
            >
              <X />
            </Button>
          </div>
          <SetupForm clientId={c.id} bar onDone={() => onAddingChange(false)} onCancel={() => onAddingChange(false)} />
        </div>
      ) : null}

      <div className="border-t pt-2">
        <Button
          type="button"
          variant="ghost"
          className="h-11 gap-1.5 text-foreground/80"
          aria-expanded={adding}
          aria-label={`Add a project for ${c.name}`}
          onClick={() => onAddingChange(!adding)}
        >
          <Plus /> Add a project
        </Button>
      </div>
    </div>
  );
}
