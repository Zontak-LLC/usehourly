"use client";

import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration, parseDuration } from "@/lib/duration";
import type { SheetEntry } from "@/lib/timesheet";
import { trpc } from "@/lib/trpc";

const LAST_PROJECT_KEY = "hourly:lastProject"; // shared with the Today page's quick-add

function readLast(): string {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) ?? "";
  } catch {
    return "";
  }
}

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/**
 * Create the same entry (project, hours, note) on every selected day of the month.
 * "Copy from" prefills the form from an entry already in this month, so repeating a day's
 * work across other days is two clicks.
 */
export function QuickCreate({
  dates,
  entries,
  onSelectWeekdays,
  onClear,
  onDone,
}: {
  dates: string[];
  entries: SheetEntry[];
  onSelectWeekdays: () => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const clients = trpc.clients.list.useQuery();
  const createMany = trpc.entry.createMany.useMutation();

  const [projectId, setProjectId] = useState("");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [skipExisting, setSkipExisting] = useState(true);

  // Default to the last project used anywhere in the app, else the first one.
  useEffect(() => {
    if (projectId || !clients.data) return;
    const all = clients.data.flatMap((c) => c.projects);
    const last = readLast();
    setProjectId(all.find((p) => p.id === last)?.id ?? all[0]?.id ?? "");
  }, [clients.data, projectId]);

  // Distinct (project, hours, note) combos already in the month, newest first.
  const templates = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; entry: SheetEntry }[] = [];
    for (const e of entries) {
      const key = `${e.project_id}|${e.minutes}|${e.note}`;
      if (e.minutes < 1 || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, entry: e });
      if (out.length >= 12) break;
    }
    return out;
  }, [entries]);

  const minutes = parseDuration(duration);
  const invalid = duration.trim() !== "" && minutes === null;
  const canCreate = dates.length > 0 && !!projectId && minutes !== null && minutes >= 1;

  async function create() {
    if (!canCreate || minutes === null) return;
    try {
      const res = await createMany.mutateAsync({ projectId, dates, minutes, note, skipExisting });
      try {
        localStorage.setItem(LAST_PROJECT_KEY, projectId);
      } catch {
        // Remembering the project is a convenience only.
      }
      await utils.entry.list.invalidate();
      if (res.skipped.length) {
        toast.warning(
          `Created ${res.created} entr${res.created === 1 ? "y" : "ies"}. Skipped ${res.skipped.length} day${
            res.skipped.length === 1 ? "" : "s"
          } that already had this project.`,
        );
      } else {
        toast.success(`Created ${res.created} entr${res.created === 1 ? "y" : "ies"}.`);
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create those entries.");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-sm">
          Quick add ·{" "}
          {dates.length === 0
            ? "click days, or drag across them (Ctrl/⌘ adds to the selection)"
            : `${dates.length} day${dates.length === 1 ? "" : "s"} selected`}
        </p>
        <div className="flex gap-3 text-xs">
          <button type="button" className="underline" onClick={onSelectWeekdays}>
            Select Mon–Fri
          </button>
          <button type="button" className="underline" onClick={onClear} disabled={dates.length === 0}>
            Clear
          </button>
        </div>
      </div>

      {templates.length > 0 && (
        <select
          aria-label="Copy from an existing entry"
          value=""
          onChange={(e) => {
            const t = templates.find((x) => x.key === e.target.value);
            if (!t) return;
            setProjectId(t.entry.project_id);
            setDuration(formatDuration(t.entry.minutes));
            setNote(t.entry.note);
          }}
          className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
        >
          <option value="">Copy from an entry in this month…</option>
          {templates.map(({ key, entry }) => (
            <option key={key} value={key}>
              {entry.project.name} · {formatDuration(entry.minutes)}
              {entry.note ? ` · ${clip(entry.note, 48)}` : ""}
            </option>
          ))}
        </select>
      )}

      <div className="grid gap-2 sm:grid-cols-[14rem_9rem_1fr]">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Project"
          className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
        >
          {clients.data?.map((c) => (
            <optgroup key={c.id} label={c.name}>
              {c.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <Input
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="Hours: 8 · 1:30"
          aria-label="Hours per day"
          aria-invalid={invalid}
          className="h-9"
        />
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you work on? (same note on every day)"
          aria-label="Description of work"
          rows={1}
          maxLength={500}
          className="min-h-9 resize-none py-1.5"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
          Skip days that already have this project
        </label>
        <Button onClick={create} disabled={!canCreate || createMany.isPending}>
          {createMany.isPending
            ? "Creating…"
            : `Create ${dates.length || ""} entr${dates.length === 1 ? "y" : "ies"}`.replace("  ", " ")}
        </Button>
      </div>
    </div>
  );
}
