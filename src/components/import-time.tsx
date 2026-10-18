"use client";

import { useMemo, useState } from "react";

import { FileUp } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { type DateOrder, IMPORT_CHUNK, type ImportFormat, MAX_IMPORT_BYTES, readTimeCsv } from "@/lib/import-csv";
import { trpc } from "@/lib/trpc";

const FORMAT_LABEL: Record<ImportFormat, string> = {
  toggl: "Toggl Track export",
  clockify: "Clockify export",
  generic: "CSV file",
};

const hours = (minutes: number) => (Math.round((minutes / 60) * 10) / 10).toLocaleString("en-US");

/** "03/04/2026" read both ways, for the one question we may have to ask. */
function bothReadings(sample: string) {
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(sample);
  if (!m) return null;
  const fmt = (month: number, day: number) =>
    new Date(Date.UTC(2000, month - 1, day)).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  return { mdy: fmt(Number(m[1]), Number(m[2])), dmy: fmt(Number(m[2]), Number(m[1])) };
}

/** Bring history in from Toggl Track, Clockify or any CSV with a date, a duration and (ideally) a project. */
export function ImportTime() {
  const utils = trpc.useUtils();
  const importRows = trpc.timeImport.importRows.useMutation();
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [order, setOrder] = useState<DateOrder | undefined>();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const read = useMemo(() => (text === null ? null : readTimeCsv(text, { dateOrder: order })), [text, order]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file) return;
    setOutcome(null);
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error("That file is larger than 5 MB. Export a shorter date range and try again.");
      return;
    }
    setFileName(file.name);
    setOrder(undefined);
    setText(await file.text());
  }

  async function run() {
    if (!read?.ok) return;
    const rows = read.preview.rows;
    const totals = { created: 0, duplicates: 0, clientsCreated: 0, projectsCreated: 0 };
    setProgress({ done: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
        const r = await importRows.mutateAsync({ rows: rows.slice(i, i + IMPORT_CHUNK) });
        totals.created += r.created;
        totals.duplicates += r.duplicates;
        totals.clientsCreated += r.clientsCreated;
        totals.projectsCreated += r.projectsCreated;
        setProgress({ done: Math.min(i + IMPORT_CHUNK, rows.length), total: rows.length });
      }
      const parts = [
        `Imported ${totals.created.toLocaleString("en-US")} ${totals.created === 1 ? "entry" : "entries"}.`,
        totals.clientsCreated || totals.projectsCreated
          ? `Added ${totals.clientsCreated} ${totals.clientsCreated === 1 ? "client" : "clients"} and ${totals.projectsCreated} ${totals.projectsCreated === 1 ? "project" : "projects"}.`
          : "",
        totals.duplicates ? `${totals.duplicates.toLocaleString("en-US")} were already here and were skipped.` : "",
      ].filter(Boolean);
      setOutcome(parts.join(" "));
      toast.success(parts[0]);
      setText(null);
      setFileName("");
      await utils.invalidate();
    } catch (err) {
      const done = totals.created + totals.duplicates;
      toast.error(
        `${err instanceof Error ? err.message : "The import stopped."}${
          done
            ? ` ${done.toLocaleString("en-US")} rows were handled first. It is safe to try again: entries already here are skipped.`
            : ""
        }`,
      );
    } finally {
      setProgress(null);
    }
  }

  const p = read?.ok ? read.preview : null;
  const readings = p?.dateOrderAmbiguous && p.dateSample ? bothReadings(p.dateSample) : null;

  return (
    <SectionCard
      title="Import from Toggl or Clockify"
      description="Bring your history over from a CSV export. Clients and projects are created for you, and importing the same file twice never doubles anything."
    >
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">How to export the file</summary>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Toggl Track:</strong> Reports, Detailed, pick the dates, Export, CSV.
          </li>
          <li>
            <strong className="text-foreground">Clockify:</strong> Reports, Detailed, pick the dates, Export, CSV.
          </li>
          <li>
            <strong className="text-foreground">Anything else:</strong> a CSV with a date column, a duration or hours
            column, and (if you like) client, project and description columns.
          </li>
        </ul>
      </details>

      <label className="inline-flex h-10 cursor-pointer items-center gap-2 self-start rounded-lg border bg-background px-4 font-medium text-sm hover:bg-muted">
        <FileUp className="size-4" aria-hidden />
        Choose a CSV file
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={pick} disabled={progress !== null} />
      </label>

      {read && !read.ok && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {fileName && <strong>{fileName}: </strong>}
          {read.error}
        </p>
      )}

      {p && (
        <div className="grid gap-3 rounded-lg border p-3 text-sm">
          <p>
            <strong>{fileName}</strong> looks like a {FORMAT_LABEL[p.format]}.
          </p>
          <p>
            Found <strong>{p.rows.length.toLocaleString("en-US")}</strong> {p.rows.length === 1 ? "entry" : "entries"}{" "}
            from {p.from} to {p.to}: <strong>{hours(p.totalMinutes)} hours</strong> across {p.clients.length}{" "}
            {p.clients.length === 1 ? "client" : "clients"} and {p.projects.length}{" "}
            {p.projects.length === 1 ? "project" : "projects"}.
          </p>

          {readings && (
            <fieldset className="grid gap-1 rounded-md border border-amber-500/60 bg-amber-500/10 p-3">
              <legend className="px-1 font-medium">Dates like {p.dateSample}: which comes first?</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="date-order"
                  checked={p.dateOrder === "mdy"}
                  onChange={() => setOrder("mdy")}
                />
                The month first (that is {readings.mdy})
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="date-order"
                  checked={p.dateOrder === "dmy"}
                  onChange={() => setOrder("dmy")}
                />
                The day first (that is {readings.dmy})
              </label>
            </fieldset>
          )}

          <ul className="grid gap-0.5 text-muted-foreground">
            {p.projects.slice(0, 6).map((x) => (
              <li key={`${x.client}/${x.project}`}>
                {x.client} / {x.project}: {x.entries.toLocaleString("en-US")} {x.entries === 1 ? "entry" : "entries"},{" "}
                {hours(x.minutes)} h
              </li>
            ))}
            {p.projects.length > 6 && <li>and {p.projects.length - 6} more projects</li>}
          </ul>

          {p.truncatedNotes > 0 && (
            <p className="text-muted-foreground">
              {p.truncatedNotes} {p.truncatedNotes === 1 ? "description was" : "descriptions were"} longer than 2,000
              characters and will be shortened.
            </p>
          )}
          {p.skipped.length > 0 && (
            <details>
              <summary className="cursor-pointer">
                {p.skipped.length} {p.skipped.length === 1 ? "row" : "rows"} will be skipped
              </summary>
              <ul className="mt-1 grid gap-0.5 text-muted-foreground">
                {p.skipped.slice(0, 8).map((s) => (
                  <li key={s.line}>
                    Line {s.line}: {s.reason}
                  </li>
                ))}
                {p.skipped.length > 8 && <li>and {p.skipped.length - 8} more</li>}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={run} disabled={progress !== null}>
              {progress
                ? `Importing ${progress.done.toLocaleString("en-US")} of ${progress.total.toLocaleString("en-US")}…`
                : `Import ${p.rows.length.toLocaleString("en-US")} ${p.rows.length === 1 ? "entry" : "entries"}`}
            </Button>
            <Button
              variant="ghost"
              disabled={progress !== null}
              onClick={() => {
                setText(null);
                setFileName("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {outcome && (
        <p role="status" className="rounded-lg border border-success/40 bg-success-soft p-3 text-sm">
          {outcome}
        </p>
      )}
    </SectionCard>
  );
}
