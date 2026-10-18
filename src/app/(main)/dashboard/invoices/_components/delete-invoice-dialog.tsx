"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

export function DeleteInvoiceDialog({
  invoice,
  onClose,
}: {
  invoice: { id: string; number: string } | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const del = trpc.invoice.delete.useMutation();

  async function remove(id: string, number: string) {
    try {
      await del.mutateAsync({ id });
      await utils.invoice.list.invalidate();
      toast.success(`Invoice ${number} deleted.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete that invoice.");
    }
  }

  return (
    <Dialog open={invoice !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete invoice {invoice?.number}?</DialogTitle>
          <DialogDescription>
            This can't be undone. The invoice and any private links to it are removed. Your time entries are not
            touched.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={() => invoice && void remove(invoice.id, invoice.number)}
          >
            <Trash2 /> {del.isPending ? "Deleting…" : "Delete invoice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
