"use client";

import { GripVertical } from "lucide-react";
import { toast } from "sonner";

import { formatDuration } from "@/lib/duration";
import { isPendingId } from "@/lib/optimistic-entries";

import type { EntryDrag } from "./use-entry-drag";

type GripEntry = {
  id: string;
  date: string;
  minutes: number;
  started_at: Date | string | null;
  project: { name: string };
};

/**
 * The handle that drags one entry of the open day onto another day of the calendar. Only for a mouse or pen (hidden on
 * touch screens, where the entry's Edit form and its Day field do the same). A running timer or an entry the server has
 * not confirmed yet cannot move, so it gets an empty slot of the same width (the rows stay aligned).
 */
export function EntryGrip({ entry, drag }: { entry: GripEntry; drag: EntryDrag }) {
  const movable = !entry.started_at && !isPendingId(entry.id);
  if (!movable) return <span aria-hidden className="pointer-coarse:hidden w-6 shrink-0" />;
  const name = `Drag ${entry.project.name} ${formatDuration(entry.minutes)} to another day`;
  return (
    <button
      type="button"
      draggable
      aria-label={name}
      title="Drag onto a day in the calendar to move this entry there"
      onClick={() => toast("Drag the handle onto a day in the calendar. Or press Edit and change the Day.")}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", entry.id); // some browsers start a drag only with data set
        // Show the whole row under the pointer, not just the small handle.
        const row = e.currentTarget.closest("li");
        if (row) e.dataTransfer.setDragImage(row, 16, 16);
        drag.setDragged({ id: entry.id, date: entry.date });
      }}
      onDragEnd={drag.end}
      className="flex pointer-coarse:hidden w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  );
}
