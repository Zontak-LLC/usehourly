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

/** Everyone invited as a roster of cards: a banner in their own colour, a big monogram, who they are, which clients they log time for, and the actions. */
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
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

  const hue = [...person.label.toLowerCase()].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 0);
  const badge = {
    active: "bg-success-soft text-success",
    pending: "bg-amber/20 text-foreground",
    expired: "bg-destructive/15 text-destructive",
    removed: "bg-muted text-foreground/75",
  }[person.status];
  const badgeWords = { active: "On the team", pending: "Waiting", expired: "Expired", removed: "Removed" }[
    person.status
  ];
  return (
    <li className="flex flex-col overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 transition-shadow hover:shadow-[0_18px_40px_-20px_color-mix(in_oklab,var(--amber)_55%,transparent)]">
      {/* the banner takes the person's own colour; the actions sit in its corner */}
      <div
        style={{ ["--h" as string]: hue }}
        className="relative h-20 bg-[linear-gradient(135deg,hsl(var(--h)_80%_60%/0.4),hsl(var(--h)_80%_60%/0.06))]"
      >
        <div className="absolute top-2 right-2 flex items-center gap-1">
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
      <div className="flex flex-1 flex-col gap-3 px-5 pb-5">
        <Avatar label={person.label} className="-mt-9 size-[4.5rem] text-3xl ring-4 ring-card" />
        <div className="min-w-0">
          <h3 className="truncate font-bold font-display text-xl">
            {person.label}
            {person.memberName && person.memberName !== person.label && (
              <span className="font-normal text-muted-foreground"> ({person.memberName})</span>
            )}
          </h3>
          {/* With no name given the title IS the address: show it once. */}
          {person.label.toLowerCase() !== person.email.toLowerCase() && (
            <p className="truncate text-muted-foreground text-sm">{person.email}</p>
          )}
          <span
            aria-hidden
            className={`mt-2 inline-flex rounded-full px-3 py-0.5 font-mono text-[11px] uppercase tracking-widest ${badge}`}
          >
            {badgeWords}
          </span>
        </div>
        {live && (
          <div className="mt-auto flex min-w-0 flex-col gap-2 border-foreground/10 border-t pt-3">
            <span className="font-mono text-[11px] text-foreground/75 uppercase tracking-widest">Logs time for</span>
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
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
              )}
            </div>
          </div>
        )}
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
