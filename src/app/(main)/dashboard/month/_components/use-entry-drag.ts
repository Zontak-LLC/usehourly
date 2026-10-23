"use client";

import { useCallback, useState } from "react";

import { toast } from "sonner";

import { useOptimisticEntries } from "@/components/use-optimistic-entries";
import { fromISODate } from "@/lib/dates";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** The entry being dragged from the open day card onto a calendar day. */
export type DraggedEntry = { id: string; date: string };

const movedDay = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

/**
 * Drag an entry from the Month day card onto another day of the calendar (a desktop pointer shortcut; the entry's Edit
 * form has a Day field that does the same with a keyboard or a finger). The move shows at once (optimistic), the server
 * confirms it, and the toast offers Undo, which moves it back the same way.
 */
export function useEntryDrag() {
  const [dragged, setDragged] = useState<DraggedEntry | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const update = trpc.entry.update.useMutation();
  const optimistic = useOptimisticEntries();

  const move = useCallback(
    async (id: string, from: string, to: string, undoable: boolean) => {
      if (from === to) return;
      const undo = await optimistic.patch(id, { date: to });
      try {
        await update.mutateAsync({ id, date: to });
        await Promise.all([utils.entry.list.invalidate(), utils.project.budgets.invalidate()]);
        const message = `${undoable ? "Moved" : "Moved back"} to ${movedDay.format(fromISODate(to))}.`;
        if (undoable) {
          toast.success(message, { action: { label: "Undo", onClick: () => void move(id, to, from, false) } });
        } else {
          toast.success(message);
        }
      } catch (err) {
        undo();
        toastError(err, "Couldn't move that entry.");
      }
    },
    [optimistic, update, utils],
  );

  const end = useCallback(() => {
    setDragged(null);
    setOverDay(null);
  }, []);

  /** Drops the dragged entry on `day` (nothing happens on its own day). */
  const dropOn = useCallback(
    (day: string) => {
      const entry = dragged;
      end();
      if (entry && entry.date !== day) void move(entry.id, entry.date, day, true);
    },
    [dragged, end, move],
  );

  return { dragged, setDragged, overDay, setOverDay, end, dropOn };
}

export type EntryDrag = ReturnType<typeof useEntryDrag>;
