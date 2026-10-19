"use client";

import { useState } from "react";

import { Plus, UsersRound } from "lucide-react";

import { InviteCard } from "./invite-form";

/**
 * The "Invite someone" card at the end of the team grid. With nobody on the team yet it is the big empty-state card;
 * clicking either one swaps it, in place, for the invitation form (and Close or Done swaps it back).
 */
export function InviteSlot({ empty }: { empty: boolean }) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <li className="sm:col-span-2">
        <InviteCard onClose={() => setOpen(false)} />
      </li>
    );
  }
  return (
    <li className={empty ? "sm:col-span-2" : undefined}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/30 p-4 text-center text-muted-foreground text-sm transition-colors hover:border-foreground/50 hover:bg-card hover:text-foreground ${
          empty ? "min-h-52" : "min-h-40"
        }`}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          {empty ? <UsersRound className="size-6" aria-hidden /> : <Plus className="size-6" aria-hidden />}
        </span>
        {empty && <span className="font-medium text-foreground">Nobody on your team yet</span>}
        <span className="flex items-center gap-1 font-medium text-foreground">
          <Plus className="size-4" aria-hidden /> Invite someone
        </span>
        {empty && (
          <span className="max-w-md">
            They can log time on the clients you choose. Each person you invite gets a card here.
          </span>
        )}
      </button>
    </li>
  );
}
