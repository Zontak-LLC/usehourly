import { formatDuration } from "@/lib/duration";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/money";

/**
 * Project budgets: a limit in hours or dollars, per calendar month or for the whole project. Money is compared as
 * cents, time as minutes, so nothing is rounded until it is shown. These are pure rules, shared by the server (which
 * works out what has been used) and the screens (which show it).
 */
export type BudgetUnit = "hours" | "dollars";
export type BudgetPeriod = "month" | "total";
export type BudgetLevel = "ok" | "warn" | "over";

/** The bar turns yellow at this share of the budget and red at 100%. */
export const WARN_AT = 0.8;

/** What billable minutes cost at the project's hourly rate, in cents (rounded once, on the total). */
export const centsFor = (minutes: number, rateCents: number): number => Math.round((minutes * rateCents) / 60);

/** The budget's unit of measure for `minutes` of work: minutes for an hours budget, cents for a dollars budget. */
export const usedAmount = (minutes: number, rateCents: number, unit: BudgetUnit): number =>
  unit === "hours" ? minutes : centsFor(minutes, rateCents);

export type BudgetStatus = {
  amount: number;
  used: number;
  unit: BudgetUnit;
  period: BudgetPeriod;
  /** used / amount, not capped: 1.25 means 25% over. */
  fraction: number;
  level: BudgetLevel;
};

export function budgetStatus(b: {
  amount: number;
  used: number;
  unit: BudgetUnit;
  period: BudgetPeriod;
}): BudgetStatus {
  const fraction = b.amount > 0 ? b.used / b.amount : 0;
  return { ...b, fraction, level: fraction >= 1 ? "over" : fraction >= WARN_AT ? "warn" : "ok" };
}

/**
 * "$640" for a money budget, "9:30 h" for an hours budget. The money is in the account's currency, without ".00" when
 * it is whole: "$640", "€1,000", "$12.50".
 */
export function formatBudgetAmount(value: number, unit: BudgetUnit, currency: string = DEFAULT_CURRENCY): string {
  return unit === "dollars" ? formatMoney(value, currency, { dropZeroCents: true }) : `${formatDuration(value)} h`;
}

/** "$640 of $1,000 this month · 64%". */
export function describeBudget(s: BudgetStatus, currency: string = DEFAULT_CURRENCY): string {
  const when = s.period === "month" ? " this month" : "";
  const pct = Math.round(s.fraction * 100);
  return `${formatBudgetAmount(s.used, s.unit, currency)} of ${formatBudgetAmount(s.amount, s.unit, currency)}${when} · ${pct}%`;
}

/**
 * Turns what was typed into the stored amount: dollars ("1000", "1,000.50") become cents, hours ("22", "22.5")
 * become minutes. Returns null for a blank box (no budget) and undefined for something that is not a usable amount.
 */
export function parseBudgetInput(text: string, unit: BudgetUnit): number | null | undefined {
  const t = text.trim().replace(/,/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
  const n = Number(t);
  const stored = Math.round(unit === "dollars" ? n * 100 : n * 60);
  return stored >= 1 && stored <= 100_000_000 ? stored : undefined;
}

/** The inverse of parseBudgetInput, for filling the box when a budget already exists. */
export function budgetInputValue(amount: number, unit: BudgetUnit): string {
  const n = unit === "dollars" ? amount / 100 : amount / 60;
  return String(Math.round(n * 100) / 100);
}
