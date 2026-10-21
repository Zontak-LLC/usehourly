"use client";

import { useState } from "react";

import { Plus, UsersRound } from "lucide-react";

import { type InviteSlotShape, inviteSlotShape } from "@/lib/team-layout";

import { InviteCard } from "./invite-form";

/**
 * The "Invite someone" card at the end of the team grid. With nobody on the team yet it is the big empty-state card;
 * when the people fill whole rows it spans the row as a slim "+" card (like "Add a project" on Clients) so there is no
 * empty space beside it; otherwise it sits next to the last person. Clicking it swaps it, in place, for the invitation
 * form (and Close or Done swaps it back).
 */
export function InviteSlot({ people }: { people: number }) {
  // While the form is open the cell keeps the shape it had when it was opened, so sending an invitation (which changes
  // the number of people) does not make the form jump wider or narrower under the person's eyes.
  const [openShape, setOpenShape] = useState<InviteSlotShape | null>(null);
  const shape = openShape ?? inviteSlotShape(people);
  const empty = shape === "empty-state";
  const span = shape === "beside" ? undefined : "sm:col-span-2";
  if (openShape) {
    // The form takes the card's own place (same cell), so nothing jumps to a new row. In a half-width cell its fields stack.
    return (
      <li className={span}>
        <InviteCard onClose={() => setOpenShape(null)} compact={shape === "beside"} />
      </li>
    );
  }
  return (
    <li className={span}>
      <button
        type="button"
        onClick={() => setOpenShape(inviteSlotShape(people))}
        className={`flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-foreground/30 border-dashed p-4 text-center text-muted-foreground text-sm transition-colors hover:border-foreground/50 hover:bg-card hover:text-foreground ${
          empty ? "min-h-52" : shape === "wide" ? "min-h-24" : "min-h-40"
        }`}
      >
        <span
          className={`flex items-center justify-center rounded-full bg-muted ${shape === "wide" ? "size-8" : "size-12"}`}
        >
          {empty ? (
            <UsersRound className="size-6" aria-hidden />
          ) : (
            <Plus className={shape === "wide" ? "size-4" : "size-6"} aria-hidden />
          )}
        </span>
        {empty && <span className="font-medium text-foreground">Nobody on your team yet</span>}
        <span className="font-medium text-foreground">Invite someone</span>
        {empty && (
          <span className="max-w-md">
            They can log time on the clients you choose. Each person you invite gets a card here.
          </span>
        )}
      </button>
    </li>
  );
}
