"use client";

import { useState } from "react";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** Pick a name and the clients, get a private link to send. The link is shown once: only its hash is stored. */
export function InviteForm() {
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
    <SectionCard
      title="Invite someone"
      description="We email them a link. They sign in with their own UseHourly account and can log time only on the clients you choose."
      onSubmit={submit}
    >
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
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-medium text-sm">Clients they can log time on</legend>
        {list.length === 0 && <p className="text-muted-foreground text-sm">Add a client first (Clients & Projects).</p>}
        {list.map((c) => (
          <label key={c.id} className="flex min-h-8 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={picked.includes(c.id)}
              onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
            />
            {c.name}
          </label>
        ))}
      </fieldset>
      <div>
        <Button type="submit" disabled={invite.isPending || !email.includes("@") || picked.length === 0}>
          Send the invitation
        </Button>
      </div>
      {sent && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-sm">
            {sent.note} You can also send this link yourself. It works once and for 7 days, and you can't see it again.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={sent.link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" onClick={copy}>
              <Copy /> Copy
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
