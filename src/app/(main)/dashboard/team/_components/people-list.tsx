"use client";

import { type ReactNode, useState } from "react";

import { Mail, UserRound, UserX } from "lucide-react";
import { toast } from "sonner";

import { HeaderCard } from "@/components/header-card";
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

/** Everyone invited, one card each: who they are, their status, which clients they may use (editable), and the buttons. */
export function PeopleList({ people, footer }: { people: Person[]; footer: ReactNode }) {
  const shown = people.filter((p) => p.status !== "removed");
  return (
    <section aria-label="Your team" className="flex flex-col gap-3">
      {shown.length > 0 && (
        <div>
          <h2 className="font-semibold text-base">Your team</h2>
          <p className="text-foreground/75 text-sm">
            Their time shows up on your Today, Week and Month pages, marked with their name.
          </p>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((p) => (
          <PersonCard key={p.id} person={p} />
        ))}
        {footer}
      </ul>
    </section>
  );
}

function PersonCard({ person }: { person: Person }) {
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
    <li>
      <HeaderCard
        className="h-full"
        header={
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserRound className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-base">
                {person.label}
                {person.memberName && person.memberName !== person.label && (
                  <span className="font-normal text-muted-foreground"> ({person.memberName})</span>
                )}
              </h3>
              <p className="truncate text-muted-foreground text-sm">{person.email}</p>
              <p
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${
                  person.status === "active" ? "bg-success-soft text-success" : "bg-muted text-foreground/80"
                }`}
              >
                {STATUS_WORDS[person.status]}
              </p>
            </div>
          </div>
        }
      >
        {live && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-muted-foreground text-xs">Can log time on</legend>
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
        {live &&
          (confirming ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-card ring-1 ring-foreground/10 p-3 text-sm">
              Remove {person.label}?
              <Button type="button" onClick={takeOut} disabled={remove.isPending}>
                Yes, remove
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {person.status !== "active" && (
                <Button type="button" variant="outline" onClick={sendAgain} disabled={resend.isPending}>
                  <Mail /> Send again
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
                <UserX /> Remove
              </Button>
            </div>
          ))}
      </HeaderCard>
    </li>
  );
}
