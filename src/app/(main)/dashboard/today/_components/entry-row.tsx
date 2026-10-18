"use client";

import { useState } from "react";

import { Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { NoteTextarea } from "@/components/note-textarea";
import { ProjectMark, useProjectLogos } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration, parseDuration } from "@/lib/duration";
import { trpc } from "@/lib/trpc";

import { MovePopover } from "./move-popover";

export type EntryData = {
  id: string;
  project_id: string;
  date: string;
  minutes: number;
  note: string;
  started_at: Date | string | null;
  project: { name: string; client: { name: string; color: string } };
};

export function EntryRow({ entry }: { entry: EntryData }) {
  const utils = trpc.useUtils();
  const logos = useProjectLogos();
  const update = trpc.entry.update.useMutation();
  const del = trpc.entry.delete.useMutation();
  const [editing, setEditing] = useState(false);
  const [duration, setDuration] = useState(formatDuration(entry.minutes));
  const [note, setNote] = useState(entry.note);
  const [projectId, setProjectId] = useState(entry.project_id);
  // Shared with the Today page's own query (same cache key), so this costs no extra request.
  const clients = trpc.clients.list.useQuery();

  const refresh = () => utils.entry.list.invalidate();
  const isRunning = !!entry.started_at;

  async function save() {
    const minutes = parseDuration(duration);
    if (minutes === null || minutes < 1) return toast.error("Couldn't read that duration. Try 1.5, 1:30 or 90m.");
    try {
      await update.mutateAsync({ id: entry.id, minutes, note, projectId });
      await refresh();
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save changes.");
    }
  }

  /** One-step reassign from the row's project label — no need to enter edit mode. */
  async function moveTo(newProjectId: string) {
    if (newProjectId === entry.project_id) return;
    const name = clients.data?.flatMap((c) => c.projects).find((p) => p.id === newProjectId)?.name;
    try {
      await update.mutateAsync({ id: entry.id, projectId: newProjectId });
      setProjectId(newProjectId); // keep the edit form's copy from reverting this on its next save
      await refresh();
      toast.success(name ? `Moved to ${name}.` : "Entry moved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't move that entry.");
    }
  }

  async function remove() {
    try {
      await del.mutateAsync({ id: entry.id });
      await Promise.all([refresh(), utils.entry.running.invalidate()]);
      toast.success("Entry deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete that entry.");
    }
  }

  const projectOptions = clients.data?.map((c) => (
    <optgroup key={c.id} label={c.name}>
      {c.projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </optgroup>
  ));

  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      {/* Header: which project this entry is for, and its controls, always visible. */}
      <header className="flex items-center justify-between gap-2 border-b bg-muted/40 py-1 pr-1 pl-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ProjectMark projectId={entry.project_id} color={entry.project.client.color} logos={logos} />
          {editing ? (
            <p className="truncate text-sm">
              <span className="font-medium">{entry.project.name}</span>
              <span className="text-muted-foreground"> · {entry.project.client.name}</span>
            </p>
          ) : (
            // Native <select> laid invisibly over the label: click anywhere on the project to reassign it.
            <div className="relative min-w-0 flex-1">
              <select
                value={entry.project_id}
                onChange={(e) => moveTo(e.target.value)}
                disabled={update.isPending || !clients.data}
                aria-label="Move to another project"
                title="Move to another project"
                className="peer absolute inset-0 size-full cursor-pointer opacity-0"
              >
                {projectOptions ?? <option value={entry.project_id}>{entry.project.name}</option>}
              </select>
              <p className="-mx-1 flex max-w-full items-center gap-x-1 rounded px-1 py-0.5 text-sm transition-colors peer-hover:bg-muted peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50">
                {/* One line on a wide screen; on a phone the client drops under the name so neither is cut short. */}
                <span className="min-w-0 max-sm:flex max-sm:flex-col sm:truncate">
                  <span className="font-medium max-sm:truncate">{entry.project.name}</span>
                  <span className="text-muted-foreground max-sm:truncate max-sm:text-xs">
                    <span className="max-sm:hidden"> · </span>
                    {entry.project.client.name}
                  </span>
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground opacity-0 peer-hover:opacity-100 max-sm:opacity-100" />
              </p>
            </div>
          )}
        </div>
        <div className="flex shrink-0">
          {editing ? (
            <>
              <Button size="icon" variant="ghost" onClick={save} aria-label="Save" disabled={update.isPending}>
                <Check />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel">
                <X />
              </Button>
            </>
          ) : (
            <>
              <MovePopover entryId={entry.id} date={entry.date} disabled={isRunning} onMoved={refresh} />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditing(true)}
                aria-label="Edit"
                disabled={isRunning}
              >
                <Pencil />
              </Button>
              <Button size="icon" variant="ghost" onClick={remove} aria-label="Delete" disabled={del.isPending}>
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Body: what was done on the left, the hours in the lower right corner. */}
      <div className="flex items-end justify-between gap-3 px-3 py-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex flex-col gap-1.5">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label="Project"
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
              >
                {projectOptions}
              </select>
              <NoteTextarea
                value={note}
                onChange={setNote}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    save();
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
                aria-label="Note"
                rows={1}
                className="min-h-8 resize-none py-1"
              />
            </div>
          ) : entry.note ? (
            <p className="whitespace-pre-wrap break-words text-sm">{entry.note}</p>
          ) : (
            <p className="text-muted-foreground/70 text-sm italic">No description</p>
          )}
        </div>
        {editing ? (
          <Input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-9 w-24 shrink-0 text-right"
            aria-label="Duration"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={isRunning}
            title={isRunning ? "Stop the timer to edit" : "Click to edit"}
            className="shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold text-lg tabular-nums enabled:cursor-pointer enabled:hover:bg-muted"
          >
            {isRunning ? `${formatDuration(entry.minutes)} +` : formatDuration(entry.minutes)}
          </button>
        )}
      </div>
    </li>
  );
}
