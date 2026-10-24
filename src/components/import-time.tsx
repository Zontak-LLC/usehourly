"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import { FileUp, Upload } from "lucide-react";
import { toast } from "sonner";

import { DataPanelHead } from "@/components/data-panel-head";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { shortDay } from "@/lib/client-list";
import { formatDuration } from "@/lib/duration";
import {
  CHECK_CHUNK,
  type DateOrder,
  IMPORT_CHUNK,
  type ImportFormat,
  type ImportPreview,
  type ImportResult,
  type ImportRow,
  MAX_IMPORT_BYTES,
  readTimeCsv,
} from "@/lib/import-csv";
import { word } from "@/lib/plural";
import { trpc } from "@/lib/trpc";

type Source = Exclude<ImportFormat, "generic"> | "other";

const SOURCES: { id: Source; label: string }[] = [
  { id: "toggl", label: "Toggl Track" },
  { id: "clockify", label: "Clockify" },
  { id: "harvest", label: "Harvest" },
  { id: "other", label: "Other CSV" },
];

/** How to get the file out of each app: two or three short steps, the menu words in bold. */
const STEPS: Record<Source, React.ReactNode[]> = {
  toggl: [
    <>
      Open <strong>Reports</strong> and choose <strong>Detailed</strong>.
    </>,
    <>Pick the dates (up to a year at a time).</>,
    <>
      Click <strong>Export</strong> and choose <strong>Download CSV</strong>.
    </>,
  ],
  clockify: [
    <>
      Open <strong>Reports</strong>, then <strong>Detailed</strong>.
    </>,
    <>Pick the dates (up to a year at a time).</>,
    <>
      Click <strong>Export</strong> and choose <strong>Save as CSV</strong>.
    </>,
  ],
  harvest: [
    <>
      Open <strong>Reports</strong>, then <strong>Time</strong>, and pick the timeframe.
    </>,
    <>
      Click <strong>Detailed report</strong>.
    </>,
    <>
      Click <strong>Export</strong> and choose <strong>CSV</strong>.
    </>,
  ],
  other: [
    <>A CSV with a date column and a duration or hours column.</>,
    <>Client, project and description columns are used when they are there.</>,
  ],
};

const FORMAT_LABEL: Record<ImportFormat, string> = {
  toggl: "a Toggl Track export",
  clockify: "a Clockify export",
  harvest: "a Harvest export",
  generic: "a CSV file",
};

const num = (n: number) => n.toLocaleString("en-US");

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

type Check = { entries: number; duplicates: number; newClients: number; newProjects: number };

/**
 * What the file would add to this account, asked of the server in parts (`timeImport.check` writes nothing). New
 * clients and projects are joined across parts by their keys, so a client named in two parts counts once.
 */
function useImportCheck(rows: ImportRow[] | null) {
  const check = trpc.timeImport.check.useMutation();
  const [state, setState] = useState<{ result: Check | null; error: string | null }>({ result: null, error: null });
  const run = useRef(0);
  const { mutateAsync } = check;
  useEffect(() => {
    const mine = ++run.current;
    setState({ result: null, error: null });
    if (!rows?.length) return;
    (async () => {
      const clients = new Set<string>();
      const projects = new Set<string>();
      let entries = 0;
      let duplicates = 0;
      try {
        for (let i = 0; i < rows.length; i += CHECK_CHUNK) {
          const r = await mutateAsync({ rows: rows.slice(i, i + CHECK_CHUNK) });
          if (mine !== run.current) return;
          entries += r.entries;
          duplicates += r.duplicates;
          for (const c of r.newClients) clients.add(c);
          for (const p of r.newProjects) projects.add(p);
        }
        setState({
          result: { entries, duplicates, newClients: clients.size, newProjects: projects.size },
          error: null,
        });
      } catch (err) {
        if (mine === run.current)
          setState({ result: null, error: err instanceof Error ? err.message : "Could not check the file." });
      }
    })();
  }, [rows, mutateAsync]);
  return state;
}

/** The first question (which app the time is in) and that app's export steps, then the file picker. */
function SourceChoice({
  source,
  onSource,
  onPick,
  busy,
}: {
  source: Source | null;
  onSource: (s: Source) => void;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  busy: boolean;
}) {
  return (
    <>
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-semibold text-sm">Where is your time now?</legend>
        <div className="flex flex-wrap gap-1 justify-self-start rounded-3xl bg-muted p-1 sm:rounded-full">
          {SOURCES.map((s) => (
            <label
              key={s.id}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 font-medium text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-foreground/40 sm:min-h-9 ${
                source === s.id
                  ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10 dark:bg-foreground/15"
                  : "text-foreground/75 hover:text-foreground"
              }`}
            >
              <input
                type="radio"
                name="import-source"
                value={s.id}
                checked={source === s.id}
                onChange={() => onSource(s.id)}
                className="sr-only"
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      {source && (
        <div className="grid gap-3">
          <ol aria-label="How to export the file" className="grid list-decimal gap-1 pl-5 text-foreground/75 text-sm">
            {STEPS[source].map((step, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of steps that never reorders
              <li key={i}>{step}</li>
            ))}
          </ol>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 justify-self-start rounded-full border border-border bg-background px-5 font-medium text-sm hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-foreground/40">
            <FileUp className="size-4" aria-hidden />
            Choose the CSV file
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onPick} disabled={busy} />
          </label>
        </div>
      )}
    </>
  );
}

/** The preview's figures: what the file holds, then (once the server answered) what is new and what is already here. */
function PreviewFigures({ p, checked }: { p: ImportPreview; checked: { result: Check | null; error: string | null } }) {
  const c = checked.result;
  return (
    <>
      <ul className="grid gap-1" data-testid="import-preview">
        <li>
          <strong>
            {num(p.rows.length)} {word(p.rows.length, "entry", "entries")}
          </strong>{" "}
          from {p.from && shortDay(p.from, null)} to {p.to && shortDay(p.to, null)} · {formatDuration(p.totalMinutes)} h
        </li>
        {c ? (
          <>
            <li>
              {c.newClients || c.newProjects
                ? `${c.newClients} new ${word(c.newClients, "client")} · ${c.newProjects} new ${word(c.newProjects, "project")}`
                : "No new clients or projects: everything goes to ones you have"}
            </li>
            {c.duplicates > 0 && (
              <li>
                {num(c.duplicates)} already here, {word(c.duplicates, "it is", "they are")} skipped
              </li>
            )}
          </>
        ) : (
          !checked.error && (
            <li role="status" className="text-foreground/75">
              Checking what is already here…
            </li>
          )
        )}
      </ul>

      {checked.error && (
        <Notice tone="danger" role="alert">
          {checked.error}
        </Notice>
      )}
    </>
  );
}

/** Bring history in from Toggl Track, Clockify, Harvest or any CSV with a date, a duration and (ideally) a project. */
export function ImportTime() {
  const utils = trpc.useUtils();
  const importRows = trpc.timeImport.importRows.useMutation();
  const [source, setSource] = useState<Source | null>(null);
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [order, setOrder] = useState<DateOrder | undefined>();
  const [read, setRead] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<{ text: string; newest: string | null } | null>(null);

  // Reading a big file takes a moment: wait one frame so "Reading the file…" shows first.
  useEffect(() => {
    setRead(null);
    if (text === null) return;
    const t = setTimeout(() => setRead(readTimeCsv(text, { dateOrder: order })), 0);
    return () => clearTimeout(t);
  }, [text, order]);

  const rows = useMemo(() => (read?.ok ? read.preview.rows : null), [read]);
  const checked = useImportCheck(rows);

  function reset() {
    setText(null);
    setFileName("");
    setRead(null);
  }

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
    if (!rows) return;
    const totals = { created: 0, duplicates: 0, clientsCreated: 0, projectsCreated: 0 };
    let newest: string | null = null;
    setProgress({ done: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
        const r = await importRows.mutateAsync({ rows: rows.slice(i, i + IMPORT_CHUNK) });
        totals.created += r.created;
        totals.duplicates += r.duplicates;
        totals.clientsCreated += r.clientsCreated;
        totals.projectsCreated += r.projectsCreated;
        if (r.newest && (newest === null || r.newest > newest)) newest = r.newest;
        setProgress({ done: Math.min(i + IMPORT_CHUNK, rows.length), total: rows.length });
      }
      const parts = [
        `Imported ${num(totals.created)} ${word(totals.created, "entry", "entries")}.`,
        totals.clientsCreated || totals.projectsCreated
          ? `Added ${totals.clientsCreated} ${word(totals.clientsCreated, "client")} and ${totals.projectsCreated} ${word(totals.projectsCreated, "project")}.`
          : "",
        totals.duplicates ? `${num(totals.duplicates)} were already here and were skipped.` : "",
      ].filter(Boolean);
      setOutcome({ text: parts.join(" "), newest });
      toast.success(parts[0]);
      reset();
      await utils.invalidate();
    } catch (err) {
      const done = totals.created + totals.duplicates;
      toast.error(
        `${err instanceof Error ? err.message : "The import stopped."}${
          done
            ? ` ${num(done)} rows were handled first. It is safe to try again: entries already here are skipped.`
            : ""
        }`,
      );
    } finally {
      setProgress(null);
    }
  }

  const p = read?.ok ? read.preview : null;
  const readings = p?.dateOrderAmbiguous && p.dateSample ? bothReadings(p.dateSample) : null;
  const c = checked.result;

  return (
    <section
      aria-label="Import history"
      className="grid gap-5 rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 sm:p-6"
    >
      <DataPanelHead icon={Upload} title="Move here in two minutes.">
        Bring your history over from Toggl Track, Clockify, Harvest or any CSV. Clients and projects are made for you,
        and importing the same file twice never doubles anything.
      </DataPanelHead>

      <SourceChoice source={source} onSource={setSource} onPick={pick} busy={progress !== null} />

      {text !== null && read === null && (
        <p role="status" className="text-foreground/75 text-sm">
          Reading the file…
        </p>
      )}

      {read && !read.ok && (
        <Notice tone="danger" role="alert">
          {fileName && <strong>{fileName}: </strong>}
          {read.error}
        </Notice>
      )}

      {p && (
        <div className="grid gap-3 text-sm">
          <p>
            <strong>{fileName}</strong> looks like {FORMAT_LABEL[p.format]}.
          </p>

          {readings && (
            <fieldset className="grid gap-1">
              <legend className="mb-1 font-medium">Dates like {p.dateSample}: which comes first?</legend>
              <label className="flex min-h-11 items-center gap-2 sm:min-h-8">
                <input
                  type="radio"
                  name="date-order"
                  checked={p.dateOrder === "mdy"}
                  onChange={() => setOrder("mdy")}
                />
                The month first (that is {readings.mdy})
              </label>
              <label className="flex min-h-11 items-center gap-2 sm:min-h-8">
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

          <PreviewFigures p={p} checked={checked} />

          <ul className="grid gap-0.5 text-foreground/75">
            {p.projects.slice(0, 6).map((x) => (
              <li key={`${x.client}/${x.project}`}>
                {x.client} / {x.project}: {num(x.entries)} {word(x.entries, "entry", "entries")},{" "}
                {formatDuration(x.minutes)} h
              </li>
            ))}
            {p.projects.length > 6 && <li>and {p.projects.length - 6} more projects</li>}
          </ul>

          {p.truncatedNotes > 0 && (
            <p className="text-foreground/75">
              {p.truncatedNotes} {p.truncatedNotes === 1 ? "description was" : "descriptions were"} longer than 2,000
              characters and will be shortened.
            </p>
          )}
          {p.skipped.length > 0 && (
            <details>
              <summary className="cursor-pointer">
                {p.skipped.length} {word(p.skipped.length, "row")} in the file can't be used
              </summary>
              <ul className="mt-1 grid gap-0.5 text-foreground/75">
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
            {/* The soft button, not the solid one: the Account page's one solid button is "Make token". */}
            <Button
              className="h-11 font-semibold max-sm:w-full"
              onClick={run}
              disabled={progress !== null || !c || c.entries === 0}
            >
              {progress
                ? `Importing ${num(progress.done)} of ${num(progress.total)}…`
                : c && c.entries === 0
                  ? "Nothing new to import"
                  : `Import ${num(c?.entries ?? p.rows.length)} ${word(c?.entries ?? p.rows.length, "entry", "entries")}`}
            </Button>
            <Button variant="ghost" className="h-11" disabled={progress !== null} onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {outcome && (
        <Notice role="status">
          {outcome.text}{" "}
          {outcome.newest && (
            <Link href={`/dashboard/week?date=${outcome.newest}`} className="font-medium underline underline-offset-2">
              See the week of {shortDay(outcome.newest, null)}
            </Link>
          )}
        </Notice>
      )}
    </section>
  );
}
