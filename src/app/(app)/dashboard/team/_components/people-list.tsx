"use client";

import { useState } from "react";

import { CircleCheck, Hourglass, Mail, MailX, Pencil, UserX } from "lucide-react";
import { toast } from "sonner";

import { IconAction } from "@/components/icon-action";
import { InlineConfirm } from "@/components/inline-confirm";
import { MoreMenu } from "@/components/more-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import { ClientChecks } from "./client-checks";
import { Avatar } from "./person-avatar";

type Person = {
  id: string;
  label: string;
  email: string;
  memberName: string | null;
  status: "pending" | "active" | "expired" | "removed";
  clientIds: string[];
};

const COLS = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.3fr)_7.5rem_minmax(0,1.6fr)_7rem]";

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

/** Everyone invited as a table, one row each: a coloured monogram and who they are, their status, the clients they log time for, and the actions. Rows keep a long team easy to scan. */
export function PeopleList({ people }: { people: Person[] }) {
  const shown = people.filter((p) => p.status !== "removed");
  return (
    <section aria-label="Your team">
      <header className="px-1 pb-2">
        <h2 className="font-display font-extrabold text-2xl">Your team</h2>
        <p className="text-foreground/75 text-sm">
          Their time shows up on your Today, Week and Month pages, marked with their name.
        </p>
      </header>
      <div className="overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10">
        <div
          aria-hidden
          className={`${COLS} gap-x-4 border-foreground/10 border-b bg-band-2 px-5 py-2 font-mono text-[11px] text-foreground/75 uppercase tracking-widest max-sm:hidden`}
        >
          <span>Person</span>
          <span>Status</span>
          <span>Logs time for</span>
          <span />
        </div>
        <ul className="divide-y divide-foreground/10">
          {shown.map((p) => (
            <PersonRow key={p.id} person={p} />
          ))}
        </ul>
      </div>
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
  const allowed = (clients.data ?? []).filter((c) => person.clientIds.includes(c.id));

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

  const _hue = [...person.label.toLowerCase()].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 0);
  const _badge = {
    active: "bg-success-soft text-success",
    pending: "bg-muted text-foreground",
    expired: "bg-destructive/15 text-destructive",
    removed: "bg-muted text-foreground/75",
  }[person.status];
  const _badgeWords = { active: "On the team", pending: "Waiting", expired: "Expired", removed: "Removed" }[
    person.status
  ];
  const badge = {
    active: "bg-success-soft text-success",
    pending: "bg-muted text-foreground",
    expired: "bg-destructive/15 text-destructive",
    removed: "bg-muted text-foreground/75",
  }[person.status];
  const badgeWords = { active: "On the team", pending: "Waiting", expired: "Expired", removed: "Removed" }[
    person.status
  ];
  return (
    <li className="transition-colors hover:bg-muted">
      <div className={`${COLS} items-center gap-x-4 gap-y-3 px-5 py-4`}>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar label={person.label} className="size-12 text-xl" />
          <div className="min-w-0">
            <h3 className="truncate font-bold font-display text-lg leading-tight">
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
        <div className="flex items-center gap-1 max-sm:order-3 max-sm:col-span-2 sm:col-start-2">
          <span
            aria-hidden
            className={`inline-flex rounded-full px-3 py-0.5 font-mono text-[11px] uppercase tracking-widest ${badge}`}
          >
            {badgeWords}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm max-sm:order-4 max-sm:col-span-2 sm:col-start-3">
          {live &&
            (editing ? (
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
                {allowed.map((c) => (
                  <span
                    key={c.name}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 ring-1 ring-foreground/10"
                  >
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: c.color ?? "var(--amber)" }}
                    />
                    {c.name}
                  </span>
                ))}
              </>
            ))}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1 max-sm:order-2 sm:col-start-4">
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
