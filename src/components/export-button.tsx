"use client";

import { useState } from "react";

import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { downloadTimesheetXlsx } from "@/lib/export-xlsx";
import type { SheetEntry } from "@/lib/timesheet";

export function ExportButton({
  entries,
  days,
  filename,
  disabled,
}: {
  entries: SheetEntry[] | undefined;
  days: string[];
  filename: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!entries) return;
    setBusy(true);
    try {
      await downloadTimesheetXlsx({ entries, days, filename });
    } catch (err) {
      toast.error(err instanceof Error ? `Export failed: ${err.message}` : "Export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={onClick} disabled={disabled || busy || !entries}>
      <Download /> {busy ? "Exporting…" : "Export Excel"}
    </Button>
  );
}
