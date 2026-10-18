"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { LogoPicker } from "@/components/logo-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fileToLogo } from "@/lib/logo";
import { trpc } from "@/lib/trpc";

/** Uncontrolled selects: their values are read from the form's FormData on save. */
function RoundingFields({ step, mode, min }: { step: number; mode: string; min: number }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="font-medium text-sm">Round the time on invoices</legend>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          name="roundStep"
          aria-label="Round to"
          defaultValue={step}
          className="h-9 rounded-lg border border-input bg-transparent px-2 dark:bg-input/30"
        >
          <option value={0}>Don't round</option>
          <option value={6}>Every 6 minutes (0.1 h)</option>
          <option value={15}>Every 15 minutes</option>
          <option value={30}>Every 30 minutes</option>
        </select>
        <select
          name="roundMode"
          aria-label="Round up or to the nearest"
          defaultValue={mode}
          className="h-9 rounded-lg border border-input bg-transparent px-2 dark:bg-input/30"
        >
          <option value="up">Round up</option>
          <option value="nearest">Round to the nearest</option>
        </select>
        <select
          name="roundMin"
          aria-label="Minimum per entry"
          defaultValue={min}
          className="h-9 rounded-lg border border-input bg-transparent px-2 dark:bg-input/30"
        >
          <option value={0}>No minimum</option>
          <option value={15}>At least 15 min per entry</option>
          <option value={30}>At least 30 min per entry</option>
          <option value={60}>At least 1 h per entry</option>
        </select>
      </div>
      <p className="text-muted-foreground text-xs">
        Applies when you make an invoice, entry by entry. Your logged time never changes, and the invoice says what was
        rounded.
      </p>
    </fieldset>
  );
}

/** Name, billing address and logo for one client — what its invoices' "bill to" block shows. */
export function ClientDetailsForm({ id, onDone }: { id: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const client = trpc.clients.get.useQuery({ id });
  const update = trpc.clients.update.useMutation();
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => setLogo(client.data?.logo ?? null), [client.data?.logo]);

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setLogo(await fileToLogo(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't use that image.");
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await update.mutateAsync({
        id,
        name: String(fd.get("name")),
        legalName: String(fd.get("legalName") ?? ""),
        address: String(fd.get("address") ?? ""),
        email: String(fd.get("email") ?? "").trim(),
        rounding: {
          step: Number(fd.get("roundStep")),
          mode: fd.get("roundMode") === "nearest" ? "nearest" : "up",
          min: Number(fd.get("roundMin")),
        },
        logo,
      });
      await Promise.all([utils.clients.list.invalidate(), utils.clients.get.invalidate({ id })]);
      toast.success("Client updated.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update that client.");
    }
  }

  if (client.isLoading) return <Skeleton className="m-4 h-32" />;
  if (client.error || !client.data) {
    return <p className="px-4 py-3 text-destructive text-sm">Couldn't load client: {client.error?.message}</p>;
  }
  return (
    <form method="post" onSubmit={save} className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`cn-${id}`}>Client name</Label>
        <Input id={`cn-${id}`} name="name" defaultValue={client.data.name} required maxLength={80} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`cf-${id}`}>Full name (shown on invoices)</Label>
        <Input
          id={`cf-${id}`}
          name="legalName"
          defaultValue={client.data.legal_name ?? ""}
          placeholder={client.data.name}
          maxLength={150}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`ca-${id}`}>Billing address (shown on invoices)</Label>
        <Textarea
          id={`ca-${id}`}
          name="address"
          defaultValue={client.data.address ?? ""}
          rows={3}
          maxLength={300}
          placeholder={"500 Market St\nSan Francisco, CA 94105"}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`ce-${id}`}>Email (where you send invoices)</Label>
        <Input
          id={`ce-${id}`}
          name="email"
          type="email"
          defaultValue={client.data.email ?? ""}
          placeholder="accounts@client.com"
          maxLength={254}
          autoComplete="off"
        />
        <p className="text-muted-foreground text-xs">Kept private. Nothing is sent to it unless you send something.</p>
      </div>
      <RoundingFields step={client.data.round_step} mode={client.data.round_mode} min={client.data.round_min} />
      <div className="grid gap-1.5">
        <Label>Logo</Label>
        <LogoPicker value={logo} onPick={pickLogo} onRemove={() => setLogo(null)} name="client logo" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={update.isPending}>
          Save client
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
