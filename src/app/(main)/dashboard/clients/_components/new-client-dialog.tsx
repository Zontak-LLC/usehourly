"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16"];

export function NewClientDialog({
  open,
  onOpenChange,
  clientCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientCount: number;
}) {
  const utils = trpc.useUtils();
  const createClient = trpc.clients.create.useMutation();
  const [name, setName] = useState("");

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    try {
      const color = PALETTE[clientCount % PALETTE.length];
      await createClient.mutateAsync({ name, color });
      await utils.clients.list.invalidate();
      setName("");
      onOpenChange(false);
      toast.success("Client added. Add its projects below.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that client.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>The company or person you do the work for. Add projects to it next.</DialogDescription>
        </DialogHeader>
        <form method="post" onSubmit={addClient} className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="New client name"
            placeholder="Client name"
            required
            maxLength={80}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createClient.isPending}>
              Add client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
