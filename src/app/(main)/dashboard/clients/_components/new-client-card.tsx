"use client";

import { useState } from "react";

import { Plus, UsersRound, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16"];

/**
 * "New client" as a card at the end of the list (UI simplification, ticket #135): a dashed card with a + that turns into
 * the form in the same place, the way Team's "Invite someone" and a client's "Add a project" do. With no clients yet it
 * is the big empty-state card.
 */
export function NewClientCard({ clientCount }: { clientCount: number }) {
  const utils = trpc.useUtils();
  const createClient = trpc.clients.create.useMutation();
  const [open, setOpen] = useState(false);
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

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-foreground/30 border-dashed p-4 text-center text-muted-foreground text-sm transition-colors hover:border-foreground/50 hover:bg-card hover:text-foreground ${
        empty ? "min-h-52" : "min-h-24"
      }`}
    >
      <span className={`flex items-center justify-center rounded-full bg-muted ${empty ? "size-12" : "size-8"}`}>
        {empty ? <UsersRound className="size-6" aria-hidden /> : <Plus className="size-4" aria-hidden />}
      </span>
      {empty && <span className="font-medium text-foreground">No clients yet</span>}
      <span className="font-medium text-foreground">New client</span>
      {empty && (
        <span className="max-w-md">
          The people or companies you do the work for. Each one gets its own projects and rates.
        </span>
      )}
    </button>
  );
}
