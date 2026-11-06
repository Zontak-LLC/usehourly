"use client";

import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** What Undo says once the entry is gone: the timer's toast and the line under Log time. */
export const UNDONE_TEXT = "Undone. Nothing was saved.";

/**
 * Undo for time just saved (the timer's ticket and the line under Log time): deletes the entry, then refreshes the
 * lists, so the row goes only when the server confirms (never optimistic). On a refusal the error toast shows and
 * `undo` answers false, so the caller keeps its Undo button for another try.
 */
export function useUndoEntry() {
  const utils = trpc.useUtils();
  const remove = trpc.entry.delete.useMutation();
  async function undo(id: string): Promise<boolean> {
    try {
      await remove.mutateAsync({ id });
      await Promise.all([utils.entry.list.invalidate(), utils.project.budgets.invalidate()]);
      return true;
    } catch (err) {
      toastError(err, "Couldn't undo that time.");
      return false;
    }
  }
  return { undo, undoing: remove.isPending };
}
