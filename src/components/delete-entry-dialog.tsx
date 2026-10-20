"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOptimisticEntries } from "@/components/use-optimistic-entries";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

export type EntryToDelete = {
  id: string;
  date: string;
  minutes: number;
  note: string;
  project: { name: string; client: { name: string } };
};

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

/**
 * Asks before an entry is deleted, saying exactly which one (project, client, day, time and the start of its
 * description), so a slip of the finger on a list never loses time. Used wherever an entry can be deleted.
 */
export function DeleteEntryDialog({ entry, onClose }: { entry: EntryToDelete | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const del = trpc.entry.delete.useMutation();
  const optimistic = useOptimisticEntries();

  async function remove(id: string) {
    // Gone from the list and the dialog closed at once; the server's answer confirms it, or the entry comes back.
    const undo = await optimistic.remove(id);
    onClose();
    try {
      await del.mutateAsync({ id });
      await Promise.all([
        utils.entry.list.invalidate(),
        utils.entry.running.invalidate(),
        utils.project.budgets.invalidate(),
        utils.project.totals.invalidate(),
      ]);
      toast.success("Entry deleted.");
    } catch (err) {
      undo();
      toastError(err, "Couldn't delete that entry.");
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete this entry?</DialogTitle>
          <DialogDescription>This can't be undone.</DialogDescription>
        </DialogHeader>
        {entry && (
          <div className="rounded-xl border bg-card p-3 text-sm">
            <p className="font-medium">
              {entry.project.name}{" "}
              <span className="font-normal text-muted-foreground">· {entry.project.client.name}</span>
            </p>
            <p className="text-muted-foreground">
              {dayFmt.format(fromISODate(entry.date))} · {formatDuration(entry.minutes)}
            </p>
            {entry.note && <p className="mt-1 line-clamp-3 break-words">{entry.note}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={del.isPending} onClick={() => entry && void remove(entry.id)}>
            <Trash2 /> {del.isPending ? "Deleting…" : "Delete entry"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
