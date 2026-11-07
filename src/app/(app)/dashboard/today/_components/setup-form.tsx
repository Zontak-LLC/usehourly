"use client";

import { useId, useState } from "react";

import { toast } from "sonner";

import { useCurrency } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currencySymbol, RATE_HINT, rateCents } from "@/lib/money";
import { browserStorage, rememberNewProject } from "@/lib/picked-project";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";
import { parseWebsite } from "@/lib/web-address";

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
  const rateId = useId();
  const hintId = useId();
  const websiteId = useId();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    // Checked before any create, so a bad address makes no client and no project. Only the Clients bar has the box.
    const website = parseWebsite(String(fd.get("website") ?? ""));
    if (!website.ok) {
      toast.error(website.message);
      return;
    }
    setPending(true);
    try {
      const id = clientId ?? (await createClient.mutateAsync({ name: String(fd.get("client")) })).id;
      const project = await createProject.mutateAsync({
        clientId: id,
        name: String(fd.get("project")),
        hourlyRate: unbilled ? 0 : rateCents(fd.get("rate")),
        billable: !unbilled,
        ...(bar && { website: website.url }),
      });
      // The project just made is the one Log time starts on (issue 431: testers logged to "General" without noticing).
      rememberNewProject(browserStorage(), project.id);
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
      className={`flex flex-wrap items-end gap-2 ${bar ? "w-full max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto]" : ""}`}
    >
      {!clientId && (
        <Input
          name="client"
          aria-label="Client name"
          placeholder="Client (e.g. Acme)"
          required
          className="w-44"
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
        className={bar ? "max-sm:col-span-2 sm:min-w-0 sm:flex-1" : "w-44"}
      />
      {/* A real label, the same words as the edit form (issue 431: a placeholder alone left the rate unnoticed). */}
      <div className={`grid gap-1 ${bar ? "shrink-0 max-sm:w-full sm:w-32" : "w-32 shrink-0"}`}>
        <Label htmlFor={rateId} className="text-xs">
          Rate per hour
        </Label>
        <Input
          id={rateId}
          name="rate"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          aria-describedby={hintId}
          onKeyDown={escapeToCancel}
          placeholder={`${currencySymbol(currency)} 0.00`}
          disabled={unbilled}
        />
      </div>
      {bar && (
        <div className="grid gap-1 max-sm:col-span-2 sm:w-56">
          <Label htmlFor={websiteId} className="text-xs">
            Website (optional)
          </Label>
          {/* Not type="url": the browser would refuse a bare magsmith.com, which parseWebsite completes. */}
          <Input
            id={websiteId}
            name="website"
            inputMode="url"
            autoComplete="url"
            placeholder="magsmith.com"
            onKeyDown={escapeToCancel}
          />
        </div>
      )}
      {bar && (
        <label className="flex min-h-10 items-center gap-1.5 text-sm max-sm:col-span-2">
          <input type="checkbox" checked={unbilled} onChange={(e) => setUnbilled(e.target.checked)} /> Not billable
        </label>
      )}
      <Button type="submit" disabled={pending} className={bar ? "px-6" : undefined}>
        {pending ? "Saving…" : "Add"}
      </Button>
      <p id={hintId} className="basis-full text-muted-foreground text-xs max-sm:col-span-2">
        {RATE_HINT}
      </p>
    </form>
  );
}
