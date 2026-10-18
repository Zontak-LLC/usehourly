"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** Inline "client + project" creator. Shown on first run and reused on the Clients page. */
export function SetupForm({
  clientId,
  onDone,
  bar = false,
}: {
  clientId?: string;
  onDone?: (projectId: string) => void;
  /** Fill the row from `sm` up: the project field stretches and the Add button ends at the far right. */
  bar?: boolean;
}) {
  const utils = trpc.useUtils();
  const createClient = trpc.clients.create.useMutation();
  const createProject = trpc.project.create.useMutation();
  const [pending, setPending] = useState(false);

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
        hourlyRate: Number.isFinite(rate) ? rate : 0,
      });
      await utils.clients.list.invalidate();
      form.reset();
      toast.success("Project added.");
      onDone?.(project.id);
    } catch (err) {
      toastError(err, "Couldn't save that. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      className={`flex flex-wrap items-end gap-2 ${bar ? "sm:min-w-0 sm:flex-1 sm:flex-nowrap" : ""}`}
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
        className={`w-44 ${bar ? "sm:w-auto sm:min-w-0 sm:flex-1" : ""}`}
      />
      <Input
        name="rate"
        type="number"
        min="0"
        step="0.01"
        aria-label="Hourly rate in dollars"
        placeholder="Rate $/h"
        className="w-28 shrink-0"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add"}
      </Button>
    </form>
  );
}
