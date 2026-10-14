"use client";

import { useState } from "react";

import { Archive } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { toISODate } from "@/lib/dates";
import { downloadExportZip, planExport } from "@/lib/export-all";
import { trpc } from "@/lib/trpc";

/** Everything the signed-in user has logged, all clients and all time, as one zip. */
export function ExportEverything({
  variant = "outline",
  className,
}: {
  variant?: "outline" | "ghost" | "secondary";
  className?: string;
}) {
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const [entries, invoices] = await Promise.all([
        utils.entry.list.fetch({ from: "1900-01-01", to: "2999-12-31" }),
        utils.invoice.list.fetch(),
      ]);
      const today = toISODate(new Date());
      const plan = await planExport({ entries, invoices, today });
      if (plan.entryCount === 0) {
        toast.info("You haven't logged any time yet, so there is nothing to export.");
        return;
      }
      await downloadExportZip(plan, `hourly-export-${today}.zip`);
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

  return (
    <Button variant={variant} className={className} onClick={run} disabled={busy}>
      <Archive /> {busy ? "Preparing your zip…" : "Download everything (.zip)"}
    </Button>
  );
}
