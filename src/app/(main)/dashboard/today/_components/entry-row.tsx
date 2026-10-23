"use client";

import { useId, useState } from "react";

import { Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DeleteEntryConfirm } from "@/components/delete-entry-dialog";
import { FoldedNote } from "@/components/folded-note";
import { NoteTextarea } from "@/components/note-textarea";
import { ProjectMark, useProjectLogos } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useOptimisticEntries } from "@/components/use-optimistic-entries";
import { useRunningMinutes } from "@/components/use-running-minutes";
import { DATE_RE, fromISODate } from "@/lib/dates";
import { formatDuration, parseDuration } from "@/lib/duration";
import { feature } from "@/lib/features";
import { QUIET_BELOW_MINUTES, ROW_FIGURE, ROW_FIGURE_QUIET } from "@/lib/figures";
import { isPendingId, projectWithClient } from "@/lib/optimistic-entries";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

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
  /** The invoice this time was billed on; null or absent = not invoiced yet. */
  invoice_id?: string | null;
  project: { name: string; client: { name: string; color: string } };
};

const FIELD_LABEL = "font-mono text-[11px] text-foreground/75 uppercase tracking-widest";
const leadDate = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const movedDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

/** The words that start a row: the project and its client, or (in a list already grouped by project) the day. */
function RowLabel({ entry, lead }: { entry: EntryData; lead: "project" | "date" }) {
  if (lead === "date") return <span className="font-medium">{leadDate.format(fromISODate(entry.date))}</span>;
  return (
    <>
      <span className="font-medium max-sm:truncate">{entry.project.name}</span>
      <span className="text-muted-foreground max-sm:truncate max-sm:text-xs">
        <span className="max-sm:hidden"> · </span>
        {entry.project.client.name}
      </span>
    </>
  );
}

export function EntryRow({
  entry,
  initialEditing = false,
  onEditDone,
  bare = false,
  lead = "project",
}: {
  entry: EntryData;
  /** Open straight into the edit form (the lists that edit an entry where it sits). */
  initialEditing?: boolean;
  /** Called when the edit form closes (saved or cancelled). */
  onEditDone?: () => void;
  /** A borderless tile with a lighter header, for when it already sits inside a card (a card never holds a framed card). */
  bare?: boolean;
  /** What the row starts with: the project (the default) or the day, for a list that is already grouped by project. */
  lead?: "project" | "date";
}) {
  const uid = useId();
  const utils = trpc.useUtils();
  const logos = useProjectLogos();
  const update = trpc.entry.update.useMutation();
  const optimistic = useOptimisticEntries();
  // An entry shown before the server has confirmed it cannot be changed yet (it has no real id to change).
  const unconfirmed = isPendingId(entry.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditingState] = useState(initialEditing);
  const setEditing = (on: boolean) => {
    setEditingState(on);
    if (!on) onEditDone?.();
  };
  const [duration, setDuration] = useState(formatDuration(entry.minutes));
  const [note, setNote] = useState(entry.note);
  const [projectId, setProjectId] = useState(entry.project_id);
  // The day lives in the edit form: a wrong day is fixed like any other field (there is no separate "move" step).
  const [date, setDate] = useState(entry.date);
  // Shared with the Today page's own query (same cache key), so this costs no extra request.
  const clients = trpc.clients.list.useQuery();

  const refresh = async () => {
    await Promise.all([utils.entry.list.invalidate(), utils.project.budgets.invalidate()]);
  };
  const isRunning = !!entry.started_at;
  const canEdit = !isRunning && !unconfirmed;
  // A running entry shows the time so far (it grows with the timer), the same figure as the watch.
  const runningNow = useRunningMinutes(entry.started_at);

  async function save() {
    const minutes = parseDuration(duration);
    if (minutes === null || minutes < 1) return toast.error("Couldn't read that duration. Try 1.5, 1:30 or 90m.");
    if (!DATE_RE.test(date)) return toast.error("Pick a day for this entry.");
    const moved = date !== entry.date;
    // Show the change and close the form at once; the server's answer confirms it, or the form opens again.
    const project = projectWithClient(clients.data, projectId);
    const undo = await optimistic.patch(entry.id, {
      minutes,
      note,
      project_id: projectId,
      ...(moved ? { date } : {}),
      ...(project ? { project } : {}),
    });
    setEditing(false);
    try {
      await update.mutateAsync({ id: entry.id, minutes, note, projectId, ...(moved ? { date } : {}) });
      await refresh();
      // A move by the Day field gets the same Undo as dragging on Month (issue 218): the entry leaves the page it was on.
      if (moved) {
        const from = entry.date;
        toast.success(`Moved to ${movedDate.format(fromISODate(date))}.`, {
          action: { label: "Undo", onClick: () => void moveBack(from, date) },
        });
      }
    } catch (err) {
      undo();
      setEditing(true);
      toastError(err, "Couldn't save changes.");
    }
  }

  /** Undo of a move: the entry goes back to the day it came from (shown at once, confirmed by the server). */
  async function moveBack(from: string, to: string) {
    setDate(from); // the edit form's copy follows, so a later save does not move it again
    const undo = await optimistic.patch(entry.id, { date: from });
    try {
      // The plain client, not the row's mutation hook: the row has usually left the page by the time Undo is pressed.
      await utils.client.entry.update.mutate({ id: entry.id, date: from });
      await refresh();
      toast.success(`Moved back to ${movedDate.format(fromISODate(from))}.`);
    } catch (err) {
      undo();
      setDate(to);
      toastError(err, "Couldn't move that entry back.");
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

  const noteBlock = (
    <div className="pb-0.5 pl-1">
      {entry.note ? (
        <FoldedNote note={entry.note} />
      ) : (
        <p className="text-muted-foreground/70 text-sm italic">No description</p>
      )}
    </div>
  );

  return (
    <li
      data-entry-id={entry.id}
      aria-busy={unconfirmed || undefined}
      className={`${bare ? "bg-card" : "overflow-hidden rounded-xl border bg-card"} ${unconfirmed ? "opacity-70" : ""}`}
    >
      {/* One row while reading (project, description, hours, controls); the tinted header returns while editing. */}
      <header
        className={
          editing
            ? `flex items-center justify-between gap-2 py-2 pr-2 pl-3 ${bare ? "bg-band-3" : "border-b bg-band-2"}`
            : "flex items-start justify-between gap-2 py-2 pr-2 pl-3"
        }
      >
        {/* A click on the row opens Edit (issue 218; it used to hide a project picker that moved the entry with no undo).
            The keyboard way in is the Edit button beside it, so this is a mouse and finger shortcut only. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut; the Edit button is the keyboard path */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the Edit button beside it is the keyboard path */}
        <div
          data-testid="entry-open"
          onClick={(e) => {
            if (!canEdit || editing) return;
            if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
            if (window.getSelection()?.toString()) return; // selecting the text to copy it is not a click
            setEditing(true);
          }}
          className={`flex min-w-0 flex-1 items-start gap-2 ${canEdit && !editing ? "cursor-pointer" : ""}`}
        >
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
                <p className="flex min-w-0 max-w-full items-center gap-x-1 py-0.5 text-sm">
                  {/* One line on a wide screen; on a phone the client drops under the name so neither is cut short. */}
                  <span className="min-w-0 max-sm:flex max-sm:flex-col sm:truncate">
                    <RowLabel entry={entry} lead={lead} />
                  </span>
                </p>
              )}
              {entry.author_id && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                  by {entry.author?.name?.trim() || "a team member"}
                </span>
              )}
              {entry.invoice_id && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                  Invoiced
                </span>
              )}
            </div>
            {!editing && noteBlock}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!editing && (
            // The hours are information, not a second way to edit: only the pencil opens the form (one way, no confusion).
            <span
              className={`px-1.5 py-0.5 ${!isRunning && entry.minutes < QUIET_BELOW_MINUTES ? ROW_FIGURE_QUIET : ROW_FIGURE}`}
            >
              {isRunning ? `${formatDuration(entry.minutes + runningNow)} +` : formatDuration(entry.minutes)}
            </span>
          )}
          {/* Edit is the common action and stays a button; it opens the form and, while open, closes it again (and says so to a screen reader). */}
          <Button
            size="icon"
            variant="outline"
            onClick={() => setEditing(!editing)}
            aria-label="Edit"
            aria-expanded={editing}
            title={editing ? "Close the edit form" : "Edit"}
            disabled={!canEdit}
          >
            <Pencil />
          </Button>
        </div>
      </header>

      {editing ? (
        // Edit form: labelled fields stacked full width (project and time side by side from sm up), so
        // nothing is squeezed next to the time box; Save and Cancel are real buttons at the bottom.
        <div className="grid gap-4 px-4 py-4 lg:grid-cols-2 lg:gap-x-8">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-project`} className={FIELD_LABEL}>
                Project
              </label>
              <NativeSelect id={`${uid}-project`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projectOptions}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-note`} className={FIELD_LABEL}>
                Description
              </label>
              <NoteTextarea
                id={`${uid}-note`}
                value={note}
                onChange={setNote}
                polish={
                  feature("aiPolish") ? { project: entry.project.name, client: entry.project.client.name } : undefined
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    save();
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
                rows={3}
                placeholder="What did you work on?"
                className="min-h-24 resize-none py-2 font-normal text-foreground text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-date`} className={FIELD_LABEL}>
              Day
            </label>
            <Input
              id={`${uid}-date`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 font-mono text-base tabular-nums"
            />
            <label htmlFor={`${uid}-time`} className={`${FIELD_LABEL} mt-2.5`}>
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
              className="h-11 font-mono font-semibold text-base tabular-nums"
              placeholder="1:30"
              autoFocus
            />
            <div className="grid grid-cols-3 gap-2">
              {/* Corrections go both ways, so the chips take time off as well as add it. */}
              {[-15, 15, 30].map((step) => (
                <Button
                  key={step}
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full px-1 text-sm"
                  onClick={() => setDuration(formatDuration(Math.max(1, (parseDuration(duration) ?? 0) + step)))}
                >
                  {step < 0 ? "−" : "+"} {Math.abs(step)} min
                </Button>
              ))}
            </div>
          </div>
          {entry.invoice_id && (
            <p className="text-muted-foreground text-sm lg:col-span-2">
              This time is already on an invoice. Changing it here does not change the invoice you made.
            </p>
          )}
          <div className="flex items-center justify-between gap-3 border-foreground/10 border-t pt-3 lg:col-span-2">
            {/* Delete lives here, away from Save, instead of in a separate menu on the row. */}
            <Button
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
              disabled={unconfirmed}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 /> Delete
            </Button>
            <div className="flex gap-2 max-sm:w-full">
              <Button variant="ghost" onClick={() => setEditing(false)} className="max-sm:flex-1">
                Cancel
              </Button>
              <Button variant="primary" onClick={save} disabled={update.isPending} className="max-sm:flex-1">
                <Check /> Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <DeleteEntryConfirm entry={confirmingDelete ? entry : null} onClose={() => setConfirmingDelete(false)} />
    </li>
  );
}
