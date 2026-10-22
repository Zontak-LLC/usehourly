"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { InlineConfirm } from "@/components/inline-confirm";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

export function DeleteInvoiceConfirm({
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
      toastError(err, "Couldn't delete that invoice.");
    }
  }

  if (!invoice) return null;
  return (
    <InlineConfirm
      title={`Delete invoice ${invoice.number}?`}
      confirmLabel="Delete invoice"
      confirmIcon={<Trash2 />}
      pending={del.isPending}
      onConfirm={() => void remove(invoice.id, invoice.number)}
      onCancel={onClose}
    >
      This can't be undone. The invoice and any private links to it are removed. Your time entries are not touched.
    </InlineConfirm>
  );
}
