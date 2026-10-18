"use client";

import { useRef, useState } from "react";

import { Plus } from "lucide-react";
import { toast } from "sonner";

import { NoteTextarea } from "@/components/note-textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDuration, parseDuration } from "@/lib/duration";
import { trpc } from "@/lib/trpc";

export type ProjectOption = { projectId: string; project: string; client: string };
export type DayEntry = { id: string; minutes: number; note: string; project: { name: string } };

/**
 * Add one or more entries to a single day from the week grid. The grid's cells hold one value
 * per project and day; this is the way to log a second (third, ...) entry on the same day,
 * for the same project or another. It stays open after each add so a whole day can be keyed
 * in a row, and it lists what the day already holds.
 */
export function AddEntryPopover({
  date,
  label,
  projects,
  projectId,
  onProjectChange,
  dayEntries,
  onDone,
}: {
  date: string;
  /** Human label for the day, e.g. "Mon 12". */
  label: string;
  projects: ProjectOption[];
  /** The project preselected: the row last worked in, else the filter, else the first row. */
  projectId: string;
  onProjectChange: (id: string) => void;
  dayEntries: DayEntry[];
  onDone: () => void;
}) {
  const create = trpc.entry.create.useMutation();
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const hoursRef = useRef<HTMLInputElement>(null);

  const selected = projects.find((p) => p.projectId === projectId) ?? projects[0];
  const dayTotal = dayEntries.reduce((sum, e) => sum + e.minutes, 0);

  async function add() {
    if (!selected) return toast.error("Add a project first (under Projects & Clients).");
    const minutes = parseDuration(duration);
    if (minutes === null || minutes < 1 || minutes > 24 * 60) {
      hoursRef.current?.focus();
      return toast.error("Couldn't read that duration. Try 1.5, 1:30 or 90m.");
    }
    try {
      await create.mutateAsync({ projectId: selected.projectId, date, minutes, note });
      toast.success(`Added ${formatDuration(minutes)} to ${selected.project}`);
      setDuration("");
      setNote("");
      onDone();
      hoursRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that entry.");
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) {
      e.preventDefault();
      add();
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDuration("");
          setNote("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Add an entry on ${label}`}
          title="Add an entry on this day"
          className="rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="center">
        <div className="flex items-baseline justify-between">
          <p className="font-medium text-sm">Add an entry · {label}</p>
          {dayTotal > 0 && <span className="text-muted-foreground text-xs">{formatDuration(dayTotal)} so far</span>}
        </div>

        <select
          aria-label="Project"
          value={selected?.projectId ?? ""}
          onChange={(e) => onProjectChange(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
        >
          {projects.map((p) => (
            <option key={p.projectId} value={p.projectId}>
              {p.client} · {p.project}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Input
            ref={hoursRef}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            onKeyDown={onEnter}
            placeholder="1.5 · 1:30 · 90m"
            aria-label="Hours"
            className="w-32 font-mono"
            autoFocus
          />
          <NoteTextarea
            value={note}
            onChange={setNote}
            onKeyDown={onEnter}
            placeholder="What did you work on?"
            aria-label="Description of work"
            rows={1}
            className="min-h-9 resize-none py-1.5"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">Enter adds it; add as many as you like</span>
          <Button size="sm" onClick={add} disabled={create.isPending}>
            {create.isPending ? "Adding…" : "Add"}
          </Button>
        </div>

        {dayEntries.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto border-t pt-2 text-sm">
            {dayEntries.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  {e.project.name}
                  {e.note && <span className="text-muted-foreground"> · {e.note}</span>}
                </span>
                <span className="shrink-0 font-mono tabular-nums">{formatDuration(e.minutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
