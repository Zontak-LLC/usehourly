"use client";

import { useState } from "react";

import { toast } from "sonner";

import { useCurrency } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currencySymbol, RATE_HINT, rateCents } from "@/lib/money";
import { firstRunNames, saveFirstRun } from "@/lib/quick-start";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** What the first run made, for the one-time line on the Log time card ("Northwind Bakery is your first client, …"). */
export type FirstClient = { clientId: string; client: string; project: string };

/**
 * The very first screen: the first client, an optional first project ("General" when empty), an optional rate, one
 * button. More clients and projects live on the "Clients" page, where the rate can also be set later.
 */
export function FirstRun({ onSaved }: { onSaved: (made: FirstClient) => void }) {
  const utils = trpc.useUtils();
  const currency = useCurrency();
  const createClient = trpc.clients.create.useMutation();
  const createProject = trpc.project.create.useMutation();
  const [answer, setAnswer] = useState("");
  const [project, setProject] = useState("");
  const [rate, setRate] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const names = firstRunNames(answer, project);
    if (!names) return toast.error("Type the name of your first client, like a company or a person.");
    setPending(true);
    try {
      // Asked here so the first invoice is not $0 (issue 431); blank stays 0 and Clients shows "No hourly rate yet".
      const { clientId } = await saveFirstRun(
        {
          // Fresh, so a client saved by a try whose project failed is found and reused (never a second client).
          listClients: () => utils.clients.list.fetch(undefined, { staleTime: 0 }),
          createClient: (name) => createClient.mutateAsync({ name }),
          createProject: (input) => createProject.mutateAsync(input),
        },
        names,
        rateCents(rate),
      );
      onSaved({ clientId, ...names });
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
        <p className="mt-1 text-base text-muted-foreground">Add your first client, then log time for them.</p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="first-run-client" className="font-medium text-base">
          Your first client
        </label>
        <Input
          id="first-run-client"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Like Northwind Bakery"
          aria-describedby="first-run-client-hint"
          className="h-12 text-base"
          maxLength={80}
          autoFocus
        />
        <p id="first-run-client-hint" className="text-muted-foreground text-sm">
          Who you do the work for: a company or a person. You can add more on Clients.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="first-run-project" className="font-medium text-base">
          First project (optional)
        </label>
        <Input
          id="first-run-project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="Like Website"
          className="h-12 text-base"
          maxLength={80}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="first-run-rate" className="font-medium text-base">
          Your hourly rate
        </label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground" aria-hidden>
            {currencySymbol(currency)}
          </span>
          <Input
            id="first-run-rate"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="0.00"
            aria-describedby="first-run-rate-hint"
            className="h-12 w-40 text-base"
          />
          <span className="text-muted-foreground" aria-hidden>
            /h
          </span>
        </div>
        <p id="first-run-rate-hint" className="text-muted-foreground text-sm">
          {RATE_HINT}
        </p>
      </div>
      <Button type="submit" size="lg" variant="primary" className="h-12 w-full text-base" disabled={pending}>
        {pending ? "Saving…" : "Add client"}
      </Button>
    </form>
  );
}
