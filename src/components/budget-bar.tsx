"use client";

import { cn } from "cn";

import { useCurrency } from "@/components/currency-provider";
import { type BudgetStatus, describeBudget } from "@/lib/budget";

const FILL = {
  ok: "bg-emerald-600 dark:bg-emerald-400",
  warn: "bg-yellow-600 dark:bg-yellow-400",
  over: "bg-rose-600 dark:bg-rose-400",
} as const;

const NOTE = { ok: "", warn: " · nearly used up", over: " · over budget" } as const;

/**
 * A project's budget as a thin bar and one line of words ("$850 of $1,000 this month · 85% · nearly used up"). The
 * colour turns yellow at 80% and red at 100%, and the words say the same, so it never depends on colour alone.
 */
export function BudgetBar({ status, className }: { status: BudgetStatus; className?: string }) {
  const currency = useCurrency();
  const percent = Math.min(100, Math.round(status.fraction * 100));
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        role="progressbar"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full", FILL[status.level])} style={{ width: `${percent}%` }} />
      </div>
      <p className={cn("text-xs", status.level === "ok" ? "text-muted-foreground" : "font-medium text-foreground")}>
        Budget: {describeBudget(status, currency)}
        {NOTE[status.level]}
      </p>
    </div>
  );
}
