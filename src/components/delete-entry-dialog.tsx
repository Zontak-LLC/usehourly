"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { InlineConfirm } from "@/components/inline-confirm";
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
 * Asks, inside the entry's own card, before an entry is deleted, saying exactly which one (project, client, day, time and the start of its
 * description), so a slip of the finger on a list never loses time. Used wherever an entry can be deleted.
 */
export function DeleteEntryConfirm({ entry, onClose }: { entry: EntryToDelete | null; onClose: () => void }) {
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

  if (!entry) return null;
  return (
    <InlineConfirm
      title="Delete this entry?"
      confirmLabel="Delete entry"
      confirmIcon={<Trash2 />}
      pending={del.isPending}
      onConfirm={() => void remove(entry.id)}
      onCancel={onClose}
    >
      <p className="font-medium text-foreground">
        {entry.project.name} <span className="font-normal text-muted-foreground">· {entry.project.client.name}</span>
      </p>
      <p>
        {dayFmt.format(fromISODate(entry.date))} · {formatDuration(entry.minutes)} · this can't be undone.
      </p>
      {entry.note && <p className="mt-1 line-clamp-3 break-words">{entry.note}</p>}
    </InlineConfirm>
  );
}
