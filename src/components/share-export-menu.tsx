"use client";

import { type ComponentType, useEffect, useRef, useState } from "react";

import { Download, FileSpreadsheet, FileText, Send, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Caret } from "@/components/caret";
import { useAccountCurrency } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/lib/accounting-export";
import { csvFilename } from "@/lib/csv";
import { downloadTimesheetXlsx } from "@/lib/export-xlsx";
import { feature } from "@/lib/features";
import { exportableEntries, type SheetEntry } from "@/lib/timesheet";

export type SharePanelKind = "range" | "share";

type PanelProps = { onClose: () => void; defaultFrom: string; defaultTo: string; projectId: string };

/** Shown in the panel's place while its code loads (only on the first open of a page visit). */
function PanelLoading() {
  return <Skeleton className="h-40 w-full rounded-xl" />;
}

/**
 * A panel whose code loads on its first open. Not next/dynamic: that keeps a failed load for the rest of the visit, so
 * one network blip would break the panel until a reload. Here only a successful load is kept; a failed one shows the
 * message and closes the panel, and the next open tries again (every failed open shows the message).
 */
function lazyPanel(load: () => Promise<ComponentType<PanelProps>>) {
  let loaded: ComponentType<PanelProps> | null = null;
  return function LazyPanel(props: PanelProps) {
    const [Panel, setPanel] = useState(() => loaded);
    // The toolbars pass a new onClose on every render; a ref keeps the load to one try per mount.
    const onCloseRef = useRef(props.onClose);
    onCloseRef.current = props.onClose;
    useEffect(() => {
      if (loaded) {
        setPanel(() => loaded);
        return;
      }
      let mounted = true;
      load().then(
        (component) => {
          loaded = component;
          if (mounted) setPanel(() => component);
        },
        () => {
          if (!mounted) return;
          toast.error("Could not load the export. Please try again.");
          onCloseRef.current();
        },
      );
      return () => {
        mounted = false;
      };
    }, []);
    return Panel ? <Panel {...props} /> : <PanelLoading />;
  };
}

// Both panels load on first open, not with Week and Month (issue 425). Never import them statically here: that would
// put their code (and the zip export behind "Download everything") back into those pages' first load.
const RangeExport = lazyPanel(() => import("@/components/range-export").then((m) => m.RangeExport));
const ShareTimesheet = lazyPanel(() => import("@/components/share-timesheet").then((m) => m.ShareTimesheet));

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
      if (format === "csv") {
        // Loaded on click: a static import would keep the "Download everything" zip code in Week and Month (issue 425).
        const { entriesCsv } = await import("@/lib/export-all");
        downloadCsv(csvFilename(filename), entriesCsv(exportableEntries(entries), accountCurrency));
      } else await downloadTimesheetXlsx({ entries, days, filename, accountCurrency });
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
