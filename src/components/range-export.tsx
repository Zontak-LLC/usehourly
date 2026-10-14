"use client";

import { useState } from "react";

import { CalendarRange, Download } from "lucide-react";
import { toast } from "sonner";

import { ExportEverything } from "@/components/export-everything";
import { ProjectFilter } from "@/components/project-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, toISODate } from "@/lib/dates";
import { checkRange, describeRange, PRESETS, presetRange, rangeFilename } from "@/lib/export-range";
import { downloadTimesheetXlsx } from "@/lib/export-xlsx";
import { dateRange } from "@/lib/timesheet";
import { trpc } from "@/lib/trpc";

/**
 * Export any date range ("March 3 to April 20") to Excel, from the Week and Month screens.
 * It starts on the range you are looking at and the project you filtered to.
 */
export function RangeExport({
  defaultFrom,
  defaultTo,
  projectId: initialProject = "",
}: {
  defaultFrom: string;
  defaultTo: string;
  projectId?: string;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [projectId, setProjectId] = useState(initialProject);
  const [busy, setBusy] = useState(false);

  const check = checkRange(from, to);

  function onOpenChange(next: boolean) {
    if (next) {
      // Start from what the screen is showing each time it opens.
      setFrom(defaultFrom);
      setTo(defaultTo);
      setProjectId(initialProject);
    }
    setOpen(next);
  }

  async function exportRange() {
    if (!check.ok) return;
    setBusy(true);
    try {
      const all = await utils.entry.list.fetch({ from, to });
      const shown = projectId ? all.filter((e) => e.project_id === projectId) : all;
      if (!shown.some((e) => e.minutes > 0)) {
        toast.info(`No time logged between ${describeRange(from, to).split(" · ")[0]}.`);
        return;
      }
      const projectName = projectId ? shown[0]?.project.name : undefined;
      await downloadTimesheetXlsx({
        entries: shown,
        days: dateRange(from, to, addDays),
        filename: rangeFilename(from, to, projectName),
        range: true,
      });
      toast.success("Your timesheet has been downloaded.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? `Export failed: ${err.message}` : "Export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const today = toISODate(new Date());

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <CalendarRange /> Date range…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-4">
        <div>
          <p className="font-medium">Export a date range</p>
          <p className="text-muted-foreground text-sm">Pick any start and end date.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="range-from">From</Label>
            <Input id="range-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="range-to">To</Label>
            <Input id="range-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Quick picks</legend>
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const r = presetRange(p.key, today);
                setFrom(r.from);
                setTo(r.to);
              }}
            >
              {p.label}
            </Button>
          ))}
        </fieldset>

        <div className="grid gap-1.5">
          <Label>Project</Label>
          <ProjectFilter value={projectId} onChange={setProjectId} />
        </div>

        <p className={`text-sm ${check.ok ? "text-muted-foreground" : "text-destructive"}`} aria-live="polite">
          {check.ok ? describeRange(from, to) : check.message}
        </p>

        <Button onClick={exportRange} disabled={!check.ok || busy}>
          <Download /> {busy ? "Exporting…" : "Export Excel"}
        </Button>

        <div className="border-t pt-3">
          <p className="mb-2 text-muted-foreground text-sm">Need all of it? Every client, all time.</p>
          <ExportEverything variant="ghost" className="w-full justify-start" />
        </div>
      </PopoverContent>
    </Popover>
  );
}
