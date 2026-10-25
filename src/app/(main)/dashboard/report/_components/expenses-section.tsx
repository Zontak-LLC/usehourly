"use client";

import { useState } from "react";

import type { inferRouterOutputs } from "@trpc/server";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { useMoney } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import { categoryLabel, describeTrip, type ExpenseDraft, NET_NOTE, netCents, summarizeExpenses } from "@/lib/expenses";
import { ROW_FIGURE } from "@/lib/figures";
import { yearRange } from "@/lib/report-year";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "@/server/routers/_app";

import { ExpenseForm } from "./expense-form";
import { SummaryRow, Table } from "./report-table";

export type ExpenseList = inferRouterOutputs<AppRouter>["expense"]["list"];

/** "Oct 9, 2026", the way dates read on screen. */
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The default date for a new expense: today in this year, else the last day of the year shown. */
function defaultDate(year: number) {
  const now = new Date();
  if (now.getFullYear() !== year) return `${year}-12-31`;
  return `${year}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The year's expenses in the currency shown, and their sums (the section and its row in the list both use it). */
export function expensesIn(rows: ExpenseList, currency: string, year: number) {
  const shown = rows.filter((r) => r.currency === currency);
  return { shown, summary: summarizeExpenses(shown, year) };
}

/**
 * Expenses on the Year summary (issue 100): add what you spent or a trip, see the year by category and quarter, and the
 * net of payments received. Rows in another currency than the one shown are left out (amounts are never mixed).
 */
export function ExpensesSection({
  year,
  currency,
  receivedCents,
  rows,
  clients,
}: {
  year: number;
  currency: string;
  receivedCents: number;
  rows: ExpenseList;
  clients: { id: string; name: string }[];
}) {
  const money = useMoney();
  const utils = trpc.useUtils();
  const create = trpc.expense.create.useMutation();
  const update = trpc.expense.update.useMutation();
  const remove = trpc.expense.delete.useMutation();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const { shown, summary } = expensesIn(rows, currency, year);
  const refresh = () => utils.expense.list.invalidate(yearRange(year));

  async function add(draft: ExpenseDraft) {
    try {
      await create.mutateAsync(draft);
      await refresh();
      setAdding(false);
      toast.success("Expense added.");
    } catch (err) {
      toastError(err, "Couldn't add the expense.");
    }
  }
  async function save(id: string, draft: ExpenseDraft) {
    try {
      await update.mutateAsync({ id, expense: draft });
      await refresh();
      setEditing(null);
      toast.success("Expense saved.");
    } catch (err) {
      toastError(err, "Couldn't save the expense.");
    }
  }
  async function del(id: string) {
    try {
      await remove.mutateAsync({ id });
      await refresh();
      setEditing(null);
      toast.success("Expense deleted.");
    } catch (err) {
      toastError(err, "Couldn't delete the expense.");
    }
  }

  return (
    <>
      <dl>
        <SummaryRow label="Spent" value={money(summary.totalCents)} />
        {summary.mileage.trips > 0 && (
          <SummaryRow
            label={`Mileage (${summary.mileage.trips} trip${summary.mileage.trips === 1 ? "" : "s"})`}
            value={money(summary.mileage.cents)}
          />
        )}
        <SummaryRow
          label="Net (received minus expenses)"
          hint={NET_NOTE}
          value={money(netCents(receivedCents, summary.totalCents))}
        />
      </dl>

      <div className="border-t px-4 py-3">
        {adding ? (
          <ExpenseForm
            idPrefix="new-expense"
            defaultDate={defaultDate(year)}
            clients={clients}
            pending={create.isPending}
            onSave={add}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button variant="outline" className="h-10" onClick={() => setAdding(true)}>
            <Plus /> Add expense
          </Button>
        )}
      </div>

      {summary.count > 0 && (
        <>
          <h3 className="border-t px-4 pt-3 font-medium text-sm">By category</h3>
          <Table
            head={["Category", "Count", "Amount"]}
            rows={summary.byCategory.map((c) => [c.label, String(c.count), money(c.cents)])}
            total={["Total", String(summary.count), money(summary.totalCents)]}
            phoneSummary={{ valueIndex: 2, detail: (r) => `${r[1]} item${r[1] === "1" ? "" : "s"}` }}
          />
          <h3 className="border-t px-4 pt-3 font-medium text-sm">By quarter</h3>
          <Table
            head={["Quarter", "Amount"]}
            rows={summary.byQuarter.map((q) => [`Q${q.quarter}`, q.cents ? money(q.cents) : "–"])}
            phoneSummary={{ valueIndex: 1, detail: () => "" }}
          />
          <h3 className="border-t px-4 pt-3 font-medium text-sm">All expenses in {year}</h3>
          <ul aria-label={`Expenses in ${year}`} className="divide-y">
            {shown.map((r) => (
              <li key={r.id} className="px-4 py-3">
                {editing === r.id ? (
                  <ExpenseForm
                    idPrefix={`expense-${r.id}`}
                    initial={r}
                    defaultDate={r.date}
                    clients={clients}
                    pending={update.isPending || remove.isPending}
                    onSave={(d) => save(r.id, d)}
                    onCancel={() => setEditing(null)}
                    onDelete={() => del(r.id)}
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {categoryLabel(r.category)}
                        {r.client && <span className="ml-2 text-muted-foreground text-sm">{r.client.name}</span>}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {[
                          dayLabel(r.date),
                          r.kind === "mileage" && r.distance && r.mileage_rate
                            ? describeTrip(r.distance, r.distance_unit ?? "mi", r.mileage_rate)
                            : null,
                          r.note,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className={ROW_FIGURE}>{money(r.amount_cents)}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => setEditing(r.id)}
                      aria-label={`Edit expense of ${dayLabel(r.date)}`}
                    >
                      Edit
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
