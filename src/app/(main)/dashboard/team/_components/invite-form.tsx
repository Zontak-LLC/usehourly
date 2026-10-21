"use client";

import { useState } from "react";

import { Copy, X } from "lucide-react";
import { toast } from "sonner";

import { HeaderCard } from "@/components/header-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import { ClientChecks } from "./client-checks";

/**
 * The invitation form as a card: pick a name and the clients, get a private link to send (shown once: only its hash is
 * stored). It opens in place of the "Invite someone" card and closes back into it.
 */
export function InviteCard({ onClose, compact = false }: { onClose: () => void; compact?: boolean }) {
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
      tile
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
      <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
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
      <ClientChecks
        legend="Clients they can log time on"
        clients={list}
        checked={picked}
        onToggle={(id, on) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)))}
        empty="Add a client first, on the Clients page."
      />
      <div>
        <Button type="submit" disabled={invite.isPending || !email.includes("@") || picked.length === 0}>
          Send the invitation
        </Button>
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
