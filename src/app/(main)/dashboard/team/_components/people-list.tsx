"use client";

import { useState } from "react";

import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

type Person = {
  id: string;
  label: string;
  email: string;
  memberName: string | null;
  status: "pending" | "active" | "expired" | "removed";
  clientIds: string[];
};

const STATUS_WORDS = {
  pending: "Invitation sent, not accepted yet",
  active: "On your team",
  expired: "Invitation expired",
  removed: "Removed",
} as const;

/** Everyone invited: who they are, which clients they may use (editable), and a way to remove them. */
export function PeopleList({ people }: { people: Person[] }) {
  const shown = people.filter((p) => p.status !== "removed");
  if (shown.length === 0) return null;
  return (
    <SectionCard
      title="Your team"
      description="Their time shows up on your Today, Week and Month pages, marked with their name."
    >
      <ul className="divide-y">
        {shown.map((p) => (
          <PersonRow key={p.id} person={p} />
        ))}
      </ul>
    </SectionCard>
  );
}

function PersonRow({ person }: { person: Person }) {
  const utils = trpc.useUtils();
  const clients = trpc.clients.list.useQuery();
  const setClients = trpc.team.setClients.useMutation();
  const remove = trpc.team.remove.useMutation();
  const resend = trpc.team.resend.useMutation();
  const [confirming, setConfirming] = useState(false);
  const live = person.status === "active" || person.status === "pending";

  async function toggle(clientId: string, on: boolean) {
    const next = on ? [...person.clientIds, clientId] : person.clientIds.filter((x) => x !== clientId);
    if (next.length === 0) return toastError(new Error("Keep at least one client, or remove them."), "");
    try {
      await setClients.mutateAsync({ id: person.id, clientIds: next });
      await utils.team.list.invalidate();
    } catch (err) {
      toastError(err, "Couldn't change their clients.");
    }
  }

  async function sendAgain() {
    try {
      const res = await resend.mutateAsync({ id: person.id });
      await utils.team.list.invalidate();
      if (res.emailed) toast.success(`Sent again to ${person.email}.`);
      else toast.info(res.reason);
    } catch (err) {
      toastError(err, "Couldn't send it again.");
    }
  }

  async function takeOut() {
    try {
      await remove.mutateAsync({ id: person.id });
      await utils.team.list.invalidate();
    } catch (err) {
      toastError(err, "Couldn't remove them.");
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {person.label}
            {person.memberName && person.memberName !== person.label && (
              <span className="font-normal text-muted-foreground"> ({person.memberName})</span>
            )}
          </p>
          <p className="text-muted-foreground text-sm">
            {person.email} · {STATUS_WORDS[person.status]}
          </p>
        </div>
        {live &&
          (confirming ? (
            <span className="flex items-center gap-2 text-sm">
              Remove {person.label}?
              <Button type="button" onClick={takeOut} disabled={remove.isPending}>
                Yes, remove
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {person.status !== "active" && (
                <Button type="button" variant="outline" onClick={sendAgain} disabled={resend.isPending}>
                  Send again
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
                Remove
              </Button>
            </span>
          ))}
      </div>
      {live && (
        <fieldset className="flex flex-wrap gap-x-4">
          <legend className="sr-only">Clients {person.label} can log time on</legend>
          {(clients.data ?? []).map((c) => (
            <label key={c.id} className="flex min-h-8 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={person.clientIds.includes(c.id)}
                onChange={(e) => toggle(c.id, e.target.checked)}
              />
              {c.name}
            </label>
          ))}
        </fieldset>
      )}
    </li>
  );
}
