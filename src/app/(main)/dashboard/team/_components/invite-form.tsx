"use client";

import { useState } from "react";

import { Copy, Send, X } from "lucide-react";
import { toast } from "sonner";

import { DocButton } from "@/components/doc-button";
import { FormStep } from "@/components/form-step";
import { HeaderCard } from "@/components/header-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import { ClientChecks } from "./client-checks";
import { Avatar } from "./person-avatar";

/** The new person's card as it will look on the team, drawn live from what is typed. */
function InvitePreview({
  label,
  email,
  clients,
}: {
  label: string;
  email: string;
  clients: { id: string; name: string; color?: string | null }[];
}) {
  const shown = label || email || "New teammate";
  const hue = [...shown.toLowerCase()].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 0);
  return (
    <aside
      aria-label="How their card will look"
      className="flex flex-col overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 lg:sticky lg:top-32"
    >
      <div
        style={{ ["--h" as string]: hue }}
        className="h-20 bg-[linear-gradient(135deg,hsl(var(--h)_80%_60%/0.4),hsl(var(--h)_80%_60%/0.06))] transition-colors duration-500"
      />
      <div className="flex flex-col gap-3 px-5 pb-5">
        <Avatar label={shown} className="-mt-9 size-[4.5rem] text-3xl ring-4 ring-card" />
        <div className="min-w-0">
          <p className="truncate font-bold font-display text-xl">{shown}</p>
          <p className="truncate text-muted-foreground text-sm">{label && email ? email : "\u00a0"}</p>
          <span
            aria-hidden
            className="mt-2 inline-flex rounded-full bg-muted px-3 py-0.5 font-mono text-[11px] uppercase tracking-widest"
          >
            Waiting
          </span>
        </div>
        <div className="flex flex-col gap-2 border-foreground/10 border-t pt-3">
          <span className="font-mono text-[11px] text-foreground/75 uppercase tracking-widest">Logs time for</span>
          <div className="flex flex-wrap gap-1.5 text-sm">
            {clients.length === 0 && <span className="text-muted-foreground">Pick a client</span>}
            {clients.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 ring-1 ring-foreground/10"
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: c.color ?? "var(--amber)" }} />
                {c.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * The invitation form as a card: pick a name and the clients, get a private link to send (shown once: only its hash is
 * stored). It opens at the top of the page from the + in the header and closes with the X.
 */
export function InviteCard({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const clients = trpc.clients.list.useQuery();
  const invite = trpc.team.invite.useMutation();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sent, setSent] = useState<{ link: string; note: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await invite.mutateAsync({ email, name, clientIds: picked });
      setSent({
        link: `${window.location.origin}/team/join/${res.token}`,
        note: res.emailed ? `We emailed ${email.trim()}.` : res.reason,
      });
      setEmail("");
      setName("");
      setPicked([]);
      await utils.team.list.invalidate();
    } catch (err) {
      toastError(err, "Couldn't make the invitation.");
    }
  }

  async function copy() {
    if (!sent) return;
    try {
      await navigator.clipboard.writeText(sent.link);
      toast.success("Link copied.");
    } catch {
      toast.info("Select the link and copy it by hand.");
    }
  }

  const list = clients.data ?? [];
  return (
    <HeaderCard
      header={
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold text-base">Invite someone</h2>
            <p className="text-foreground/75 text-sm">
              We email them a link. They sign in with their own UseHourly account and can log time only on the clients
              you choose.
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </Button>
        </div>
      }
      onSubmit={submit}
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
        <div className="flex flex-col gap-6">
          <FormStep n={1} title="Who are you inviting?">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-email">Their email address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  placeholder="sam@example.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-name">Their name (optional)</Label>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder="Sam"
                />
              </div>
            </div>
          </FormStep>
          <FormStep n={2} title="What can they log time on?">
            <ClientChecks
              legend="Clients they can log time on"
              clients={list}
              checked={picked}
              onToggle={(id, on) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)))}
              empty="Add a client first, on the Clients page."
            />
          </FormStep>
        </div>
        <InvitePreview label={name.trim()} email={email.trim()} clients={list.filter((c) => picked.includes(c.id))} />
      </div>
      <div>
        <DocButton
          type="submit"
          tone="amber"
          icon={<Send />}
          title="Send the invitation"
          hint="They get a private link"
          label="Send the invitation"
          busy={invite.isPending}
          disabled={invite.isPending || !email.includes("@") || picked.length === 0}
          className="disabled:from-muted disabled:to-muted disabled:text-foreground/55 disabled:opacity-100 disabled:shadow-none"
        />
        {(!email.includes("@") || picked.length === 0) && (
          <p className="mt-2 text-foreground/75 text-sm">Add their email and pick at least one client.</p>
        )}
      </div>
      {sent && (
        <div className="flex flex-col gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
          <p className="text-sm">
            {sent.note} You can also send this link yourself. It works once and for 7 days, and you can't see it again.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={sent.link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" onClick={copy}>
              <Copy /> Copy
            </Button>
          </div>
          <div>
            <Button type="button" variant="outline" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </HeaderCard>
  );
}
