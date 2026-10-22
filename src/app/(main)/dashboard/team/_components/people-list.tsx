"use client";

import { useState } from "react";

import { CircleCheck, Hourglass, Mail, MailX, Pencil, UserRound, UserX } from "lucide-react";
import { toast } from "sonner";

import { IconAction } from "@/components/icon-action";
import { InlineConfirm } from "@/components/inline-confirm";
import { MoreMenu } from "@/components/more-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import { ClientChecks } from "./client-checks";

type Person = {
  id: string;
  label: string;
  email: string;
  memberName: string | null;
  status: "pending" | "active" | "expired" | "removed";
  clientIds: string[];
};

const STATUS_WORDS = {
  pending: "Invitation sent, waiting to accept",
  active: "On your team",
  expired: "Invitation expired, send it again",
  removed: "Removed",
} as const;

/** One icon says where an invitation stands (hourglass = waiting, check = joined, crossed mail = expired); the words are in the tooltip and for screen readers. */
const STATUS_ICON = { pending: Hourglass, active: CircleCheck, expired: MailX, removed: UserX } as const;

function StatusIcon({ status }: { status: Person["status"] }) {
  const Icon = STATUS_ICON[status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so the tooltip opens from the keyboard and on touch
          tabIndex={0}
          className={`inline-flex size-8 items-center justify-center rounded-full ${status === "active" ? "bg-success-soft" : "bg-muted text-foreground/80"}`}
        >
          <Icon className="size-4" aria-hidden />
          <span className="sr-only">{STATUS_WORDS[status]}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{STATUS_WORDS[status]}</TooltipContent>
    </Tooltip>
  );
}

/** Everyone invited, one row each (cards group, rows list): who they are, their status, their clients, and the actions. */
export function PeopleList({ people }: { people: Person[] }) {
  const shown = people.filter((p) => p.status !== "removed");
  return (
    <section aria-label="Your team" className="overflow-hidden rounded-xl border bg-card">
      <header className="bg-band-2 px-3 py-3 sm:px-4">
        <h2 className="font-semibold text-base">Your team</h2>
        <p className="text-foreground/75 text-sm">
          Their time shows up on your Today, Week and Month pages, marked with their name.
        </p>
      </header>
      <ul>
        {shown.map((p) => (
          <PersonRow key={p.id} person={p} />
        ))}
      </ul>
    </section>
  );
}

function PersonRow({ person }: { person: Person }) {
  const utils = trpc.useUtils();
  const clients = trpc.clients.list.useQuery();
  const setClients = trpc.team.setClients.useMutation();
  const remove = trpc.team.remove.useMutation();
  const resend = trpc.team.resend.useMutation();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const live = person.status === "active" || person.status === "pending";
  const allowed = (clients.data ?? []).filter((c) => person.clientIds.includes(c.id)).map((c) => c.name);

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

  const menu = [
    ...(person.status !== "active"
      ? [{ label: "Send again", icon: <Mail />, onSelect: sendAgain, disabled: resend.isPending }]
      : []),
    { label: "Remove from team", icon: <UserX />, onSelect: () => setConfirming(true), destructive: true },
  ];

  return (
    <li className="border-t first:border-t-0">
      {/* Three columns on a wide screen (who, status and clients, actions); on a phone the actions sit beside the name and the details drop under it. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] sm:px-4">
        <div className="flex min-w-0 items-center gap-3 sm:row-start-1">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserRound className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-base">
              {person.label}
              {person.memberName && person.memberName !== person.label && (
                <span className="font-normal text-muted-foreground"> ({person.memberName})</span>
              )}
            </h3>
            {/* With no name given the title IS the address: show it once. */}
            {person.label.toLowerCase() !== person.email.toLowerCase() && (
              <p className="truncate text-muted-foreground text-sm">{person.email}</p>
            )}
          </div>
        </div>
        {/* The middle is only who they may log time for; the status is the icon beside the buttons. */}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm max-sm:col-span-2 max-sm:row-start-2 sm:col-start-2 sm:row-start-1">
          {live ? (
            <>
              <span className="mr-1 text-muted-foreground text-xs">Logs time for</span>
              {editing ? (
                <ClientChecks
                  legend="Can log time on"
                  legendClassName="sr-only"
                  clients={clients.data ?? []}
                  checked={person.clientIds}
                  onToggle={toggle}
                />
              ) : (
                <>
                  {allowed.length === 0 && <span className="text-muted-foreground">No clients</span>}
                  {allowed.map((name) => (
                    <span key={name} className="rounded-md bg-muted px-2 py-0.5">
                      {name}
                    </span>
                  ))}
                </>
              )}
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:col-start-3 sm:row-start-1">
          <StatusIcon status={person.status} />
          {live && (
            <>
              <IconAction
                label={`Edit clients for ${person.label}`}
                tip="Change their clients"
                expanded={editing}
                onClick={() => setEditing(!editing)}
              >
                <Pencil />
              </IconAction>
              <MoreMenu label={`More actions for ${person.label}`} items={menu} />
            </>
          )}
        </div>
      </div>
      {confirming && (
        <InlineConfirm
          title={`Remove ${person.label}?`}
          confirmLabel="Remove"
          confirmIcon={<UserX />}
          pending={remove.isPending}
          onConfirm={takeOut}
          onCancel={() => setConfirming(false)}
        >
          They can no longer log time. Their entries stay on your books.
        </InlineConfirm>
      )}
    </li>
  );
}
