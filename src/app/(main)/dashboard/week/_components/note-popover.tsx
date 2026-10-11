"use client";

import { useState } from "react";

import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { parseDuration } from "@/lib/duration";
import { trpc } from "@/lib/trpc";

export type CellEntry = { id: string; note: string };

/**
 * Add or edit the description of work for one grid cell (project × day).
 * With an entry it edits that entry's note; on an empty cell it asks for hours too and
 * creates the entry, so a day can be logged with its description in one step.
 */
export function NotePopover({
  projectId,
  date,
  label,
  entry,
  onDone,
}: {
  projectId: string;
  date: string;
  label: string;
  entry: CellEntry | null;
  onDone: () => void;
}) {
  const update = trpc.entry.update.useMutation();
  const create = trpc.entry.create.useMutation();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(entry?.note ?? "");
  const [duration, setDuration] = useState("");

  const hasNote = !!entry?.note;
  const busy = update.isPending || create.isPending;

  async function save() {
    try {
      if (entry) {
        await update.mutateAsync({ id: entry.id, note });
      } else {
        const minutes = parseDuration(duration);
        if (minutes === null || minutes < 1) {
          return toast.error("Enter the hours for this day too. Try 1.5, 1:30 or 90m.");
        }
        await create.mutateAsync({ projectId, date, minutes, note });
      }
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that description.");
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          // Always start from what's saved, not from an abandoned edit.
          setNote(entry?.note ?? "");
          setDuration("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={hasNote ? `Edit description for ${label}` : `Add description for ${label}`}
          title={hasNote ? entry?.note : "Add a description"}
          className={`absolute top-1/2 left-1 -translate-y-1/2 rounded p-0.5 transition-colors hover:bg-muted ${
            hasNote ? "text-primary" : "text-muted-foreground/40 hover:text-foreground"
          }`}
        >
          <StickyNote className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start">
        <p className="font-medium text-sm">{label}</p>
        {!entry && (
          <Input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Hours: 1.5 · 1:30 · 90m"
            aria-label="Hours"
          />
        )}
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            // Enter saves (fast path); Shift+Enter adds a line break.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              save();
            }
          }}
          placeholder="What did you work on?"
          aria-label="Description of work"
          rows={3}
          maxLength={500}
          autoFocus
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">Enter to save · Shift+Enter for a new line</span>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
