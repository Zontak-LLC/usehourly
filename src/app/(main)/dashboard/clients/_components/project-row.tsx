"use client";

import { useState } from "react";

import { Archive, Pencil } from "lucide-react";

import { BudgetBar } from "@/components/budget-bar";
import { useCurrency, useMoney } from "@/components/currency-provider";
import { FormStep } from "@/components/form-step";
import { GuideLink } from "@/components/guide-link";
import { IconAction } from "@/components/icon-action";
import { LogoPicker } from "@/components/logo-picker";
import { ProjectMark } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ValueSlider } from "@/components/value-slider";
import { type BudgetStatus, budgetInputValue } from "@/lib/budget";
import { formatDuration } from "@/lib/duration";
import { feature } from "@/lib/features";
import { currencySymbol } from "@/lib/money";

import type { ClientRow, ProjectRow as ProjectData, ProjectTotals } from "./client-types";
import type { ProjectEditing } from "./use-project-editing";

/** The columns of the project table (the header in the client card uses the same ones). Phones use two columns. */
export const PROJECT_COLS = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_7rem_6rem_6rem_2.75rem]";

/**
 * One project as a ROW in its client's table: name (with its budget bar under it), rate, this month, all time, and the
 * buttons. On a phone the rate and all-time figures move under the name and the month's hours sit at the right.
 */
export function ProjectLine({
  project: p,
  clientColor,
  totals,
  budget,
  onEdit,
}: {
  project: ProjectData;
  clientColor: string;
  totals: ProjectTotals | undefined;
  budget?: BudgetStatus;
  onEdit: () => void;
}) {
  const money = useMoney();
  const month = formatDuration(totals?.[p.id]?.range ?? 0);
  const allTime = formatDuration(totals?.[p.id]?.total ?? 0);
  const rate =
    p.hourly_rate > 0 ? (
      <span className="font-medium">{money(p.hourly_rate)}/h</span>
    ) : p.billable ? (
      <span className="text-destructive text-xs" title="Use the pencil to set an hourly rate">
        No hourly rate yet
      </span>
    ) : (
      <span className="text-muted-foreground">–</span>
    );
  return (
    <li className={`${PROJECT_COLS} items-center gap-x-3 gap-y-1 border-t px-3 py-2.5 text-sm first:border-t-0`}>
      <div className="min-w-0 max-sm:col-start-1 max-sm:row-start-1">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: clientColor }} />
          <h3 className="truncate font-medium">{p.name}</h3>
          {!p.billable && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-foreground/70 text-xs">non-billable</span>
          )}
        </div>
        {budget && feature("budgets") && (
          <div className="mt-1.5 max-w-xs">
            <BudgetBar status={budget} />
          </div>
        )}
      </div>
      {/* Rate and all time: their own columns on a wide screen; on a phone one muted line under the name. */}
      <div className="contents max-sm:col-start-1 max-sm:row-start-2 max-sm:flex max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-2 max-sm:text-muted-foreground max-sm:text-xs">
        <p className="sm:col-start-2 sm:row-start-1 sm:text-right">{rate}</p>
        <p className="font-mono tabular-nums sm:col-start-4 sm:row-start-1 sm:text-right sm:text-foreground/75">
          <span className="sm:hidden">· all time </span>
          {allTime}
        </p>
      </div>
      <p className="text-right font-medium font-mono tabular-nums max-sm:col-start-2 max-sm:row-start-1 sm:col-start-3 sm:row-start-1">
        {month}
      </p>
      {/* One button per row (Edit), in the same column on every card; archiving lives in the edit form. */}
      <span className="flex justify-end max-sm:col-start-2 max-sm:row-start-2 sm:col-start-5 sm:row-start-1">
        <IconAction label={`Edit ${p.name}`} tip="Edit project" onClick={onEdit}>
          <Pencil />
        </IconAction>
      </span>
    </li>
  );
}

/** One project in its edit form (it takes the whole row): name, client, rate, billable, budget, logo. */
export function ProjectEditCard({
  project: p,
  clients,
  logos,
  editing,
  onArchive,
}: {
  project: ProjectData;
  clients: ClientRow[] | undefined;
  logos: Record<string, string>;
  editing: ProjectEditing;
  /** Archive the project (kept with its time; the toast offers Undo). */
  onArchive: () => void;
}) {
  const currency = useCurrency();
  // The rate and the budget are held here so a slider and its number box move together; both still post by name.
  const [rate, setRate] = useState(p.hourly_rate > 0 ? (p.hourly_rate / 100).toFixed(2) : "");
  const [budget, setBudget] = useState(
    p.budget_amount !== null && (p.budget_unit === "hours" || p.budget_unit === "dollars")
      ? budgetInputValue(p.budget_amount, p.budget_unit)
      : "",
  );
  const [unit, setUnit] = useState<string>(p.budget_unit ?? "dollars");
  const hours = unit === "hours";
  const withBudget = feature("budgets");
  return (
    <li className="px-1 py-3 sm:px-3">
      <form
        method="post"
        onSubmit={(e) => editing.saveProject(e, p.id)}
        className="flex flex-col gap-7 rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 sm:p-6"
      >
        <header className="flex items-center gap-3">
          <ProjectMark
            projectId={p.id}
            color={clients?.find((cl) => cl.id === p.client_id)?.color ?? "#2563c9"}
            logos={logos}
            size={36}
          />
          <div className="min-w-0">
            <h3 className="truncate font-bold font-display text-xl leading-tight">Edit {p.name}</h3>
            <p className="text-foreground/75 text-sm">
              {withBudget
                ? "Change the name, the rate, a budget or the picture."
                : "Change the name, the rate or the picture."}
            </p>
          </div>
        </header>

        <FormStep n={1} title="What is it?">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor={`pn-${p.id}`}>Project name</Label>
              <Input id={`pn-${p.id}`} name="name" defaultValue={p.name} required autoFocus clearable />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`pc-${p.id}`}>Client</Label>
              <NativeSelect id={`pc-${p.id}`} name="clientId" defaultValue={p.client_id}>
                {clients?.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-muted px-4 ring-1 ring-foreground/10">
              <input
                type="checkbox"
                name="billable"
                defaultChecked={p.billable}
                className="size-5 accent-[var(--amber)]"
              />
              <span className="text-sm">
                <span className="font-semibold">Billable</span>
                <span className="block text-foreground/70 text-xs">Counts on invoices</span>
              </span>
            </label>
          </div>
        </FormStep>

        <FormStep n={2} title="What do you charge?">
          <div className="grid gap-1">
            <div className="flex items-end justify-between gap-3">
              <span className="font-medium text-sm">Hourly rate</span>
              <span className="font-display font-extrabold text-2xl tabular-nums">
                {currencySymbol(currency)}
                {rate ? Number(rate) : 0}
                <span className="font-normal text-muted-foreground text-sm">/h</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <ValueSlider
                value={Number(rate) || 0}
                min={0}
                max={300}
                step={5}
                label="Hourly rate slider"
                valueText={`${rate || 0} per hour`}
                onChange={(v) => setRate(v ? v.toFixed(2) : "")}
              />
              <Input
                name="rate"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={rate}
                // No rate yet is an empty box with a hint (a real "0.00" turned a typed 95 into 0.0095); a click selects what is there.
                placeholder="0.00"
                onChange={(e) => setRate(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                clearable
                wrapperClassName="w-32 shrink-0"
                className="font-mono"
                aria-label="Rate per hour"
              />
            </div>
          </div>
        </FormStep>

        {withBudget && (
          <FormStep n={3} title="Budget (optional)">
            <fieldset className="grid gap-1">
              <legend className="sr-only">Budget</legend>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1 font-medium text-sm">
                  Budget <GuideLink topic="budgets" label="project budgets" />
                </span>
                <span className="font-display font-extrabold text-2xl tabular-nums">
                  {budget ? `${hours ? "" : currencySymbol(currency)}${Number(budget)}${hours ? " h" : ""}` : "none"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <ValueSlider
                  value={Number(budget) || 0}
                  min={0}
                  max={hours ? 200 : 10000}
                  step={hours ? 5 : 100}
                  label="Budget slider"
                  valueText={budget ? `${budget} ${hours ? "hours" : currency}` : "no budget"}
                  onChange={(v) => setBudget(v ? String(v) : "")}
                />
                <Input
                  name="budgetAmount"
                  inputMode="decimal"
                  placeholder="none"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-24 font-mono"
                  aria-label="Budget amount"
                />
                <NativeSelect
                  name="budgetUnit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  aria-label="Budget unit"
                  className="w-28"
                >
                  <option value="dollars">{currency}</option>
                  <option value="hours">hours</option>
                </NativeSelect>
                <NativeSelect
                  name="budgetPeriod"
                  defaultValue={p.budget_period}
                  aria-label="Budget period"
                  className="w-32"
                >
                  <option value="month">per month</option>
                  <option value="total">in total</option>
                </NativeSelect>
              </div>
              <span className="text-muted-foreground text-xs">Leave blank for no budget.</span>
            </fieldset>
          </FormStep>
        )}

        <FormStep n={withBudget ? 4 : 3} title="Picture">
          <LogoPicker
            compact
            value={editing.logoDraft === undefined ? logos[p.id] : editing.logoDraft}
            onPick={editing.pickProjectLogo}
            onRemove={editing.removeLogoDraft}
            name="project logo"
          />
        </FormStep>

        <div className="flex items-center justify-end gap-2 border-foreground/10 border-t pt-4">
          {/* Rare and away from Save: archiving keeps the project's time and can be undone. */}
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            onClick={() => {
              editing.stopEditing();
              onArchive();
            }}
          >
            <Archive /> Archive project
          </Button>
          <Button type="button" variant="ghost" onClick={editing.stopEditing}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={editing.isSaving}>
            Save
          </Button>
        </div>
      </form>
    </li>
  );
}
