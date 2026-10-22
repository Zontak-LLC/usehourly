"use client";

import { useState } from "react";

import { UsersRound, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16"];

/**
 * "New client". The way in is the + in the page header; it opens this form as a card at the TOP of the list, and Cancel
 * (or adding the client) closes it. With no clients yet the page shows the big dashed empty-state card instead, which
 * opens the same form. `open` is held by the page, because the header button and the card share it.
 */
export function NewClientCard({
  clientCount,
  open,
  onOpenChange,
}: {
  clientCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const createClient = trpc.clients.create.useMutation();
  const setOpen = onOpenChange;
  const [name, setName] = useState("");
  const empty = clientCount === 0;

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createClient.mutateAsync({ name, color: PALETTE[clientCount % PALETTE.length] });
      await utils.clients.list.invalidate();
      setName("");
      setOpen(false);
      toast.success("Client added. Add its projects below.");
    } catch (err) {
      toastError(err, "Couldn't add that client.");
    }
  }

  if (open) {
    return (
      <section aria-label="New client" className="flex flex-col gap-3 rounded-xl border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-base">New client</h2>
            <p className="text-foreground/75 text-sm">
              The company or person you do the work for. Add projects to it next.
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-10 shrink-0"
            onClick={() => setOpen(false)}
            aria-label="Cancel"
          >
            <X />
          </Button>
        </div>
        <form method="post" onSubmit={addClient} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="New client name"
            placeholder="Client name"
            required
            maxLength={80}
            autoFocus
            className="h-11 flex-1"
          />
          <Button type="submit" className="h-11" disabled={createClient.isPending}>
            Add client
          </Button>
        </form>
      </section>
    );
  }

  // Once there are clients the + in the header is the way in: no card waits at the foot of the list.
  if (!empty) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex min-h-52 w-full flex-col items-center justify-center gap-2 rounded-xl border border-foreground/30 border-dashed p-4 text-center text-muted-foreground text-sm transition-colors hover:border-foreground/50 hover:bg-card hover:text-foreground"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <UsersRound className="size-6" aria-hidden />
      </span>
      <span className="font-medium text-foreground">No clients yet</span>
      <span className="font-medium text-foreground">New client</span>
      <span className="max-w-md">
        The people or companies you do the work for. Each one gets its own projects and rates.
      </span>
    </button>
  );
}
