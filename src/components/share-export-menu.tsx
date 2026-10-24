"use client";

import { Download, FileSpreadsheet, FileText, Send, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Caret } from "@/components/caret";
import { useAccountCurrency } from "@/components/currency-provider";
import { RangeExport } from "@/components/range-export";
import { ShareTimesheet } from "@/components/share-timesheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv } from "@/lib/accounting-export";
import { csvFilename, entriesCsv } from "@/lib/export-all";
import { downloadTimesheetXlsx } from "@/lib/export-xlsx";
import { feature } from "@/lib/features";
import { exportableEntries, type SheetEntry } from "@/lib/timesheet";

export type SharePanelKind = "range" | "share";

/** The form a menu choice opens, drawn by the toolbar right under its row (not in a pop-up). */
export function SharePanel({
  panel,
  onClose,
  defaultFrom,
  defaultTo,
  projectId,
}: {
  panel: SharePanelKind | null;
  onClose: () => void;
  defaultFrom: string;
  defaultTo: string;
  projectId: string;
}) {
  if (panel === "range")
    return <RangeExport onClose={onClose} defaultFrom={defaultFrom} defaultTo={defaultTo} projectId={projectId} />;
  if (panel === "share" && feature("signOff"))
    return <ShareTimesheet onClose={onClose} defaultFrom={defaultFrom} defaultTo={defaultTo} projectId={projectId} />;
  return null;
}

/**
 * One button for everything that takes the hours out of the screen: download what you are looking at, export any date
 * range, or send hours to a client for sign-off. It replaced three separate buttons on Week and Month, so the toolbar is
 * the project filter, this menu and the date arrows.
 */
export function ShareExportMenu({
  entries,
  days,
  filename,
  period,
  onPanel,
  className,
}: {
  entries: SheetEntry[] | undefined;
  days: string[];
  filename: string;
  /** What the screen shows, for the menu wording: "week" or "month". */
  period: "week" | "month";
  /** Called with the form the person picked; the toolbar shows it under its row. */
  onPanel: (panel: SharePanelKind) => void;
  /** Layout classes for the button (the toolbars make it fill the row on a phone). */
  className?: string;
}) {
  const accountCurrency = useAccountCurrency();
  // Sign-off links are hidden in this release; the menu is then only about exporting, and says so.
  const signOff = feature("signOff");

  async function download(format: "xlsx" | "csv") {
    if (!entries) return;
    try {
      if (format === "csv") downloadCsv(csvFilename(filename), entriesCsv(exportableEntries(entries), accountCurrency));
      else await downloadTimesheetXlsx({ entries, days, filename, accountCurrency });
    } catch (err) {
      toast.error(err instanceof Error ? `Export failed: ${err.message}` : "Export failed. Please try again.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={`group h-10 ${className ?? ""}`}>
          {signOff ? (
            <>
              <Share2 /> Share &amp; export
            </>
          ) : (
            <>
              <Download /> Export
            </>
          )}{" "}
          <Caret />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuItem disabled={!entries} onSelect={() => void download("xlsx")}>
          <Download /> Download this {period} as Excel
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!entries} onSelect={() => void download("csv")}>
          <FileText /> Download this {period} as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onPanel("range")}>
          <FileSpreadsheet /> Export a date range…
        </DropdownMenuItem>
        {signOff && (
          <DropdownMenuItem onSelect={() => onPanel("share")}>
            <Send /> Send to a client for sign-off…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
