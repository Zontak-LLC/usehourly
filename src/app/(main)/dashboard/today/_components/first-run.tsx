"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { firstRunNames } from "@/lib/quick-start";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/**
 * The very first screen: one question, one button. The client and a default project are created
 * behind the scenes; rates and extra projects live on the "Clients" page for later.
 */
export function FirstRun() {
  const utils = trpc.useUtils();
  const createClient = trpc.clients.create.useMutation();
  const createProject = trpc.project.create.useMutation();
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const names = firstRunNames(answer);
    if (!names) return toast.error("Type who you work for, like a company or a person.");
    setPending(true);
    try {
      const client = await createClient.mutateAsync({ name: names.client });
      await createProject.mutateAsync({ clientId: client.id, name: names.project, hourlyRate: 0 });
      await utils.clients.list.invalidate();
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
      data-headerless="the one welcome question, a card of its own"
      className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6"
    >
      <div>
        <h2 className="font-semibold text-xl">Welcome! Let's get your first hours logged.</h2>
        <p className="mt-1 text-base text-muted-foreground">
          First, tell us who you do the work for. You can add more later.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="first-run-client" className="font-medium text-base">
          Who do you work for?
        </label>
        <Input
          id="first-run-client"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          clearable
          placeholder="A company or a person, like Acme"
          className="h-12 text-base"
          maxLength={80}
          autoFocus
        />
      </div>
      <Button type="submit" size="lg" variant="primary" className="h-12 text-base" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
