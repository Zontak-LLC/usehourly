"use client";

import { Archive, Pencil } from "lucide-react";

import { BudgetBar } from "@/components/budget-bar";
import { useCurrency, useMoney } from "@/components/currency-provider";
import { GuideLink } from "@/components/guide-link";
import { IconAction } from "@/components/icon-action";
import { LogoPicker } from "@/components/logo-picker";
import { MoreMenu } from "@/components/more-menu";
import { ProjectMark } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type BudgetStatus, budgetInputValue } from "@/lib/budget";
import { formatDuration } from "@/lib/duration";
import { currencySymbol } from "@/lib/money";

import type { ClientRow, ProjectRow as ProjectData, ProjectTotals } from "./client-types";
import type { ProjectEditing } from "./use-project-editing";

/** One project as a tile: a header with its name and buttons, then the rate, this month and all time, and its budget. */
export function ProjectCard({
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
  const money = useMoney();
  return (
    <li className="flex flex-col overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-2 bg-band-3 py-2 pr-2 pl-3">
        <span className="flex min-w-0 items-center gap-2">
          <ProjectMark projectId={p.id} color={clientColor} logos={logos} />
          <h3 className="truncate font-semibold text-sm">{p.name}</h3>
          {!p.billable && (
            <span className="shrink-0 rounded-full border px-2 py-0.5 text-foreground/70 text-xs">non-billable</span>
          )}
        </span>
        {/* Edit is the common action and stays visible; archiving is rare, so it sits behind the ··· menu. */}
        <span className="flex gap-1">
          <IconAction label={`Edit ${p.name}`} tip="Edit project" onClick={onEdit}>
            <Pencil />
          </IconAction>
          <MoreMenu
            label={`More actions for ${p.name}`}
            items={[{ label: "Archive project", icon: <Archive />, onSelect: onArchive, destructive: true }]}
          />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 text-sm">
        <p>
          {p.hourly_rate > 0 ? (
            <span className="font-medium">{money(p.hourly_rate)}/h</span>
          ) : p.billable ? (
            <span className="text-destructive text-xs" title="Use the pencil to set an hourly rate">
              No hourly rate yet
            </span>
          ) : (
            <span className="text-muted-foreground">No rate (non-billable)</span>
          )}
        </p>
        <dl className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-muted-foreground text-xs">This month</dt>
            <dd className="font-medium font-mono tabular-nums">{formatDuration(totals?.[p.id]?.range ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">All time</dt>
            <dd className="font-medium font-mono tabular-nums">{formatDuration(totals?.[p.id]?.total ?? 0)}</dd>
          </div>
        </dl>
        {budget && <BudgetBar status={budget} />}
      </div>
    </li>
  );
}

/** One project in its edit form (a card spanning the row): name, client, rate, billable, budget, logo. */
export function ProjectEditCard({
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
  const currency = useCurrency();
  return (
    <li className="overflow-hidden rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10 sm:col-span-2">
      <form method="post" onSubmit={(e) => editing.saveProject(e, p.id)} className="flex flex-wrap items-center gap-2">
        <Input name="name" defaultValue={p.name} required className="w-44" autoFocus />
        <select
          name="clientId"
          defaultValue={p.client_id}
          aria-label="Client"
          className="h-9 rounded-lg border border-input bg-card px-2 text-sm dark:bg-input/30"
        >
          {clients?.map((cl) => (
            <option key={cl.id} value={cl.id}>
              {cl.name}
            </option>
          ))}
        </select>
        <span className="flex items-center gap-1 text-muted-foreground text-sm">
          {currencySymbol(currency)}
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
          <GuideLink topic="budgets" label="project budgets" />
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
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm dark:bg-input/30"
          >
            <option value="dollars">{currency}</option>
            <option value="hours">hours</option>
          </select>
          <select
            name="budgetPeriod"
            defaultValue={p.budget_period}
            aria-label="Budget period"
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm dark:bg-input/30"
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
