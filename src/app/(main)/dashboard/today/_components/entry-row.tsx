"use client";

import { useId, useState } from "react";

import { Check, ChevronDown, Pencil } from "lucide-react";
import { toast } from "sonner";

import { DeleteEntryConfirm } from "@/components/delete-entry-dialog";
import { FoldedNote } from "@/components/folded-note";
import { NoteTextarea } from "@/components/note-textarea";
import { ProjectMark, useProjectLogos } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOptimisticEntries } from "@/components/use-optimistic-entries";
import { formatDuration, parseDuration } from "@/lib/duration";
import { isPendingId, projectWithClient } from "@/lib/optimistic-entries";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import { EntryMenu } from "./entry-menu";
import { MovePopover } from "./move-popover";

export type EntryData = {
  id: string;
  project_id: string;
  date: string;
  minutes: number;
  note: string;
  started_at: Date | string | null;
  /** The team member who logged it; absent or null for the account's own entries. */
  author?: { name: string | null } | null;
  author_id?: string | null;
  project: { name: string; client: { name: string; color: string } };
};

export function EntryRow({
  entry,
  initialEditing = false,
  onEditDone,
  bare = false,
}: {
  entry: EntryData;
  /** Open straight into the edit form (the lists that edit an entry where it sits). */
  initialEditing?: boolean;
  /** Called when the edit form closes (saved or cancelled). */
  onEditDone?: () => void;
  /** A borderless tile with a lighter header, for when it already sits inside a card (a card never holds a framed card). */
  bare?: boolean;
}) {
  const uid = useId();
  const utils = trpc.useUtils();
  const logos = useProjectLogos();
  const update = trpc.entry.update.useMutation();
  const optimistic = useOptimisticEntries();
  // An entry shown before the server has confirmed it cannot be changed yet (it has no real id to change).
  const unconfirmed = isPendingId(entry.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [moving, setMoving] = useState(false);
  const [editing, setEditingState] = useState(initialEditing);
  const setEditing = (on: boolean) => {
    setEditingState(on);
    if (!on) onEditDone?.();
  };
  const [duration, setDuration] = useState(formatDuration(entry.minutes));
  const [note, setNote] = useState(entry.note);
  const [projectId, setProjectId] = useState(entry.project_id);
  // Shared with the Today page's own query (same cache key), so this costs no extra request.
  const clients = trpc.clients.list.useQuery();

  const refresh = async () => {
    await Promise.all([utils.entry.list.invalidate(), utils.project.budgets.invalidate()]);
  };
  const isRunning = !!entry.started_at;

  async function save() {
    const minutes = parseDuration(duration);
    if (minutes === null || minutes < 1) return toast.error("Couldn't read that duration. Try 1.5, 1:30 or 90m.");
    // Show the change and close the form at once; the server's answer confirms it, or the form opens again.
    const project = projectWithClient(clients.data, projectId);
    const undo = await optimistic.patch(entry.id, {
      minutes,
      note,
      project_id: projectId,
      ...(project ? { project } : {}),
    });
    setEditing(false);
    try {
      await update.mutateAsync({ id: entry.id, minutes, note, projectId });
      await refresh();
    } catch (err) {
      undo();
      setEditing(true);
      toastError(err, "Couldn't save changes.");
    }
  }

  /** One-step reassign from the row's project label — no need to enter edit mode. */
  async function moveTo(newProjectId: string) {
    if (newProjectId === entry.project_id) return;
    const name = clients.data?.flatMap((c) => c.projects).find((p) => p.id === newProjectId)?.name;
    const project = projectWithClient(clients.data, newProjectId);
    const undo = await optimistic.patch(entry.id, { project_id: newProjectId, ...(project ? { project } : {}) });
    try {
      await update.mutateAsync({ id: entry.id, projectId: newProjectId });
      setProjectId(newProjectId); // keep the edit form's copy from reverting this on its next save
      await refresh();
      toast.success(name ? `Moved to ${name}.` : "Entry moved.");
    } catch (err) {
      undo();
      toastError(err, "Couldn't move that entry.");
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
    <li
      aria-busy={unconfirmed || undefined}
      className={`${
        bare
          ? "overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10"
          : "overflow-hidden rounded-xl border bg-card"
      } ${unconfirmed ? "opacity-70" : ""}`}
    >
      {/* One row while reading (project, description, hours, controls); the tinted header returns while editing. */}
      <header
        className={
          editing
            ? `flex items-center justify-between gap-2 py-2 pr-2 pl-3 ${bare ? "bg-band-3" : "border-b bg-band-2"}`
            : "flex items-start justify-between gap-2 py-2 pr-2 pl-3"
        }
      >
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span className="mt-1.5 shrink-0">
            <ProjectMark projectId={entry.project_id} color={entry.project.client.color} logos={logos} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2">
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
                    disabled={update.isPending || !clients.data || unconfirmed}
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
              {entry.author_id && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                  by {entry.author?.name?.trim() || "a team member"}
                </span>
              )}
            </div>
            {!editing && (
              <div className="pb-0.5 pl-1">
                {entry.note ? (
                  <FoldedNote note={entry.note} />
                ) : (
                  <p className="text-muted-foreground/70 text-sm italic">No description</p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={isRunning || unconfirmed}
              title={isRunning ? "Stop the timer to edit" : "Click to edit"}
              className="rounded px-1.5 py-0.5 font-mono font-semibold text-lg tabular-nums enabled:cursor-pointer enabled:hover:bg-muted"
            >
              {isRunning ? `${formatDuration(entry.minutes)} +` : formatDuration(entry.minutes)}
            </button>
          )}
          {/* Edit is the common action and stays a button; it opens the form and, while open, closes it again (and says so to a screen reader). */}
          <Button
            size="icon"
            variant="outline"
            onClick={() => setEditing(!editing)}
            aria-label="Edit"
            aria-expanded={editing}
            title={editing ? "Close the edit form" : "Edit"}
            disabled={isRunning || unconfirmed}
          >
            <Pencil />
          </Button>
          {!editing && (
            <MovePopover entryId={entry.id} date={entry.date} open={moving} onOpenChange={setMoving} onMoved={refresh}>
              <span className="inline-flex">
                <EntryMenu
                  disabled={isRunning || unconfirmed}
                  deleteDisabled={unconfirmed}
                  onMove={() => setMoving(true)}
                  onDelete={() => setConfirmingDelete(true)}
                />
              </span>
            </MovePopover>
          )}
        </div>
      </header>

      {editing ? (
        // Edit form: labelled fields stacked full width (project and time side by side from sm up), so
        // nothing is squeezed next to the time box; Save and Cancel are real buttons at the bottom.
        <div className="flex flex-col gap-3 px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${uid}-project`} className="font-medium text-muted-foreground text-xs">
                Project
              </label>
              <select
                id={`${uid}-project`}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="h-10 rounded-lg border border-input bg-card px-2 font-normal text-foreground text-sm dark:bg-input/30"
              >
                {projectOptions}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${uid}-time`} className="font-medium text-muted-foreground text-xs">
                Time
              </label>
              <Input
                id={`${uid}-time`}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="h-10 font-mono font-semibold text-base tabular-nums"
                placeholder="1:30"
                autoFocus
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-note`} className="font-medium text-muted-foreground text-xs">
              Description
            </label>
            <NoteTextarea
              id={`${uid}-note`}
              value={note}
              onChange={setNote}
              polish={{ project: entry.project.name, client: entry.project.client.name }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  save();
                }
                if (e.key === "Escape") setEditing(false);
              }}
              rows={2}
              placeholder="What did you work on?"
              className="min-h-16 resize-none py-2 font-normal text-foreground text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(false)} className="max-sm:flex-1">
              Cancel
            </Button>
            <Button onClick={save} disabled={update.isPending} className="max-sm:flex-1">
              <Check /> Save
            </Button>
          </div>
        </div>
      ) : null}
      <DeleteEntryConfirm entry={confirmingDelete ? entry : null} onClose={() => setConfirmingDelete(false)} />
    </li>
  );
}
