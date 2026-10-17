"use client";

import { useState } from "react";

import { ChevronDown, Download, FileSpreadsheet, Send, Share2 } from "lucide-react";
import { toast } from "sonner";

import { RangeExport } from "@/components/range-export";
import { ShareTimesheet } from "@/components/share-timesheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadTimesheetXlsx } from "@/lib/export-xlsx";
import type { SheetEntry } from "@/lib/timesheet";

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
  defaultFrom,
  defaultTo,
  projectId,
}: {
  entries: SheetEntry[] | undefined;
  days: string[];
  filename: string;
  /** What the screen shows, for the menu wording: "week" or "month". */
  period: "week" | "month";
  defaultFrom: string;
  defaultTo: string;
  projectId: string;
}) {
  const [panel, setPanel] = useState<"range" | "share" | null>(null);

  async function download() {
    if (!entries) return;
    try {
      await downloadTimesheetXlsx({ entries, days, filename });
    } catch (err) {
      toast.error(err instanceof Error ? `Export failed: ${err.message}` : "Export failed. Please try again.");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Share2 /> Share &amp; export <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuItem disabled={!entries} onSelect={() => void download()}>
            <Download /> Download this {period} as Excel
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPanel("range")}>
            <FileSpreadsheet /> Export a date range…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPanel("share")}>
            <Send /> Send to a client for sign-off…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RangeExport
        open={panel === "range"}
        onOpenChange={(o) => setPanel(o ? "range" : null)}
        defaultFrom={defaultFrom}
        defaultTo={defaultTo}
        projectId={projectId}
      />
      <ShareTimesheet
        open={panel === "share"}
        onOpenChange={(o) => setPanel(o ? "share" : null)}
        defaultFrom={defaultFrom}
        defaultTo={defaultTo}
        projectId={projectId}
      />
    </>
  );
}
