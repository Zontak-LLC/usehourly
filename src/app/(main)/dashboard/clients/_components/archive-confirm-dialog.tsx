"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ArchiveTarget = { kind: "client" | "project"; id: string; name: string };

export function ArchiveConfirmDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: ArchiveTarget | null;
  onCancel: () => void;
  onConfirm: (target: ArchiveTarget) => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archive {target?.name}?</DialogTitle>
          <DialogDescription>
            {target?.kind === "client"
              ? "It disappears from the lists and the invoice builder. Your logged time and past invoices are kept, and importing time for it brings it back."
              : "It disappears from the project pickers. Your logged time and past invoices are kept, and you can restore it under Archived projects."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Keep it
          </Button>
          <Button onClick={() => target && onConfirm(target)}>Archive</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
