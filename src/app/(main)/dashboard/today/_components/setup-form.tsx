"use client";

import { useState } from "react";

import { toast } from "sonner";

import { useCurrency } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currencySymbol } from "@/lib/money";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** Inline "client + project" creator. Shown on first run and reused on the Clients page. */
export function SetupForm({
  clientId,
  onDone,
  onCancel,
  bar = false,
}: {
  clientId?: string;
  onDone?: (projectId: string) => void;
  /** Closes the form: called when Escape is pressed in a field (the parent shows its own Cancel button). */
  onCancel?: () => void;
  /** Fill the row from `sm` up: the project field stretches and the Add button ends at the far right. */
  bar?: boolean;
}) {
  const currency = useCurrency();
  const utils = trpc.useUtils();
  const createClient = trpc.clients.create.useMutation();
  const createProject = trpc.project.create.useMutation();
  const [pending, setPending] = useState(false);
  // Work you do not bill (admin, your own business): no rate, and it never shows "No hourly rate yet".
  const [unbilled, setUnbilled] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setPending(true);
    try {
      const id = clientId ?? (await createClient.mutateAsync({ name: String(fd.get("client")) })).id;
      const rate = Math.round(Number(fd.get("rate") || 0) * 100);
      const project = await createProject.mutateAsync({
        clientId: id,
        name: String(fd.get("project")),
        hourlyRate: unbilled || !Number.isFinite(rate) ? 0 : rate,
        billable: !unbilled,
      });
      await utils.clients.list.invalidate();
      form.reset();
      setUnbilled(false);
      toast.success("Project added.");
      onDone?.(project.id);
    } catch (err) {
      toastError(err, "Couldn't save that. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const escapeToCancel = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel?.();
  };

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      className={`flex flex-wrap items-end gap-2 ${bar ? "w-full max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] sm:flex-nowrap" : ""}`}
    >
      {!clientId && (
        <Input
          name="client"
          aria-label="Client name"
          placeholder="Client (e.g. Acme)"
          required
          clearable
          wrapperClassName="w-44"
          autoFocus
        />
      )}
      <Input
        name="project"
        aria-label="Project name"
        placeholder="Project (e.g. Website)"
        required
        autoFocus={bar}
        onKeyDown={escapeToCancel}
        clearable
        wrapperClassName={bar ? "max-sm:col-span-2 sm:min-w-0 sm:flex-1" : "w-44"}
      />
      <Input
        name="rate"
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        aria-label={`Hourly rate in ${currency}`}
        onKeyDown={escapeToCancel}
        placeholder={`Rate ${currencySymbol(currency)}/h`}
        disabled={unbilled}
        clearable
        wrapperClassName={bar ? "shrink-0 max-sm:w-full sm:w-32" : "w-32 shrink-0"}
      />
      {bar && (
        <label className="flex min-h-10 items-center gap-1.5 text-sm max-sm:col-span-2">
          <input type="checkbox" checked={unbilled} onChange={(e) => setUnbilled(e.target.checked)} /> Not billable
        </label>
      )}
      <Button type="submit" disabled={pending} className={bar ? "px-6" : undefined}>
        {pending ? "Saving…" : "Add"}
      </Button>
    </form>
  );
}
