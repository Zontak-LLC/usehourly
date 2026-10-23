"use client";

import { useState } from "react";

import { Archive } from "lucide-react";
import { toast } from "sonner";

import { useAccountCurrency } from "@/components/currency-provider";
import { DocButton } from "@/components/doc-button";
import { Button } from "@/components/ui/button";
import { toISODate } from "@/lib/dates";
import { downloadExportZip, planExport } from "@/lib/export-all";
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

  /** Every entry, fetched a page at a time so no single response is huge. */
  async function fetchAllEntries() {
    const all: Awaited<ReturnType<typeof utils.entry.listAll.fetch>>["items"] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 200; page++) {
      const res: Awaited<ReturnType<typeof utils.entry.listAll.fetch>> = await utils.entry.listAll.fetch({ cursor });
      all.push(...res.items);
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    return all;
  }

  async function run() {
    setBusy(true);
    try {
      const [entries, invoices] = await Promise.all([fetchAllEntries(), utils.invoice.list.fetch()]);
      const today = toISODate(new Date());
      const plan = await planExport({ entries, invoices, today, accountCurrency });
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
