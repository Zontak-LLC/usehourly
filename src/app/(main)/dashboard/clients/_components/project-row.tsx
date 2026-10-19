"use client";

import { Archive, Pencil } from "lucide-react";

import { BudgetBar } from "@/components/budget-bar";
import { ICON_TONE, IconAction } from "@/components/icon-action";
import { LogoPicker } from "@/components/logo-picker";
import { ProjectMark } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type BudgetStatus, budgetInputValue } from "@/lib/budget";
import { formatDuration } from "@/lib/duration";

import type { ClientRow, ProjectRow as ProjectData, ProjectTotals } from "./client-types";
import type { ProjectEditing } from "./use-project-editing";

/** The columns of a project row from `sm` up: name, rate, this month, all time, buttons. The column heads use it too. */
export const PROJECT_GRID = "sm:grid-cols-[minmax(0,1fr)_6rem_6rem_6.5rem_5rem]";

/** One project in its read-only form: name, rate, this month / all-time totals, edit and archive. */
export function ProjectRow({
  project: p,
  clientColor,
  logos,
  totals,
  budget,
  onEdit,
  onArchive,
}: {
  project: ProjectData;
  clientColor: string;
  logos: Record<string, string>;
  totals: ProjectTotals | undefined;
  budget?: BudgetStatus;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-1 py-2.5 text-sm ${PROJECT_GRID}`}>
      <span className="flex min-w-0 items-center gap-2 sm:col-start-1 sm:row-start-1">
        <ProjectMark projectId={p.id} color={clientColor} logos={logos} />
        <span className="truncate font-medium">{p.name}</span>
        {!p.billable && <span className="shrink-0 text-foreground/70 text-xs">non-billable</span>}
      </span>
      {/* Wide screens: icons with a tooltip (as on Invoices). Phones: see the labelled row below. */}
      <span className="col-start-2 row-start-1 flex justify-end gap-1 max-sm:hidden sm:col-start-5">
        <IconAction label={`Edit ${p.name}`} tip="Edit project" onClick={onEdit} className="border-transparent">
          <Pencil className={ICON_TONE.edit} />
        </IconAction>
        <IconAction
          label={`Archive ${p.name}`}
          tip="Archive project"
          onClick={onArchive}
          className="border-transparent"
        >
          <Archive className={ICON_TONE.archive} />
        </IconAction>
      </span>
      {/* Second line on a phone (labelled); on sm and up the three cells join the columns above. */}
      <div className="col-span-2 row-start-2 flex flex-wrap justify-between gap-x-4 pl-7 text-foreground/75 sm:contents">
        <span className="sm:col-start-2 sm:row-start-1">
          {p.hourly_rate > 0 ? (
            `$${(p.hourly_rate / 100).toFixed(2)}/h`
          ) : p.billable ? (
            <span className="text-destructive text-xs" title="Use the pencil to set an hourly rate">
              No hourly rate yet
            </span>
          ) : (
            "–"
          )}
        </span>
        <span className="font-mono tabular-nums sm:col-start-3 sm:row-start-1 sm:text-right">
          <span className="font-sans text-xs sm:hidden">This month </span>
          {formatDuration(totals?.[p.id]?.range ?? 0)}
        </span>
        <span className="font-mono tabular-nums sm:col-start-4 sm:row-start-1 sm:text-right">
          <span className="font-sans text-xs sm:hidden">All time </span>
          {formatDuration(totals?.[p.id]?.total ?? 0)}
        </span>
      </div>
      {budget && <BudgetBar status={budget} className="col-span-full mt-2 pl-7" />}
      <div className="col-span-2 mt-2 flex gap-1.5 sm:hidden">
        <IconAction label={`Edit ${p.name}`} tip="Edit project" text="Edit" onClick={onEdit}>
          <Pencil className={ICON_TONE.edit} />
        </IconAction>
        <IconAction label={`Archive ${p.name}`} tip="Archive project" text="Archive" onClick={onArchive}>
          <Archive className={ICON_TONE.archive} />
        </IconAction>
      </div>
    </li>
  );
}

/** One project in its edit form: name, client, rate, billable, budget, logo. */
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
    <li className="px-1 py-3">
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
            inputMode="decimal"
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
        <fieldset className="flex basis-full flex-wrap items-center gap-2 text-sm">
          <legend className="sr-only">Budget</legend>
          <span className="text-muted-foreground">Budget</span>
          <Input
            name="budgetAmount"
            inputMode="decimal"
            placeholder="none"
            defaultValue={
              p.budget_amount !== null && (p.budget_unit === "hours" || p.budget_unit === "dollars")
                ? budgetInputValue(p.budget_amount, p.budget_unit)
                : ""
            }
            className="w-24"
            aria-label="Budget amount"
          />
          <select
            name="budgetUnit"
            defaultValue={p.budget_unit ?? "dollars"}
            aria-label="Budget unit"
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            <option value="dollars">dollars</option>
            <option value="hours">hours</option>
          </select>
          <select
            name="budgetPeriod"
            defaultValue={p.budget_period}
            aria-label="Budget period"
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            <option value="month">per month</option>
            <option value="total">in total</option>
          </select>
          <span className="text-muted-foreground text-xs">Leave blank for no budget.</span>
        </fieldset>
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
