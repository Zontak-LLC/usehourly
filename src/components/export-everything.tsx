"use client";

import { useState } from "react";

import { Archive } from "lucide-react";
import { toast } from "sonner";

import { useAccountCurrency } from "@/components/currency-provider";
import { DocButton } from "@/components/doc-button";
import { Button } from "@/components/ui/button";
import { toISODate } from "@/lib/dates";
import { feature } from "@/lib/features";
import { trpc } from "@/lib/trpc";

/** Everything the signed-in user has logged, all clients and all time, as one zip. */
export function ExportEverything({
  variant = "outline",
  className,
  big = false,
}: {
  variant?: "outline" | "ghost" | "secondary";
  className?: string;
  /** The big two-line document button (Account > Your data) instead of a small one. */
  big?: boolean;
}) {
  const accountCurrency = useAccountCurrency();
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    // The zip code loads on the first click, like exceljs and jspdf, so the pages with this button load less (issue 425).
    let exportAll: typeof import("@/lib/export-all");
    try {
      exportAll = await import("@/lib/export-all");
    } catch {
      toast.error("Could not load the export. Please try again.");
      setBusy(false);
      return;
    }
    const { downloadExportZip, fetchAllPages, planExport } = exportAll;
    try {
      // Every row of each list, a page at a time (invoices too: `invoice.list` stops at the newest 200, issue 451).
      // Expenses are a hidden feature: with the switch off there is no request for them at all.
      const [entries, invoices, expenses] = await Promise.all([
        fetchAllPages((cursor) => utils.entry.listAll.fetch({ cursor })),
        fetchAllPages((cursor) => utils.invoice.listAll.fetch({ cursor })),
        feature("expenses") ? fetchAllPages((cursor) => utils.expense.listAll.fetch({ cursor })) : [],
      ]);
      const today = toISODate(new Date());
      const plan = await planExport({ entries, invoices, expenses, today, accountCurrency });
      if (plan.entryCount === 0) {
        toast.info("You haven't logged any time yet, so there is nothing to export.");
        return;
      }
      await downloadExportZip(plan, `usehourly-export-${today}.zip`);
      toast.success(
        `Downloaded ${plan.entryCount} ${plan.entryCount === 1 ? "entry" : "entries"} for ${plan.clientCount} ${
          plan.clientCount === 1 ? "client" : "clients"
        }.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? `Export failed: ${err.message}` : "Export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (big) {
    return (
      <DocButton
        onClick={run}
        disabled={busy}
        busy={busy}
        icon={<Archive />}
        title={busy ? "Preparing your zip…" : "Download everything"}
        hint="A zip of spreadsheets and CSV files"
        label={busy ? "Preparing your zip…" : "Download everything"}
        className={className}
      />
    );
  }
  return (
    <Button variant={variant} className={className} onClick={run} disabled={busy}>
      <Archive /> {busy ? "Preparing your zip…" : "Download everything"}
    </Button>
  );
}
