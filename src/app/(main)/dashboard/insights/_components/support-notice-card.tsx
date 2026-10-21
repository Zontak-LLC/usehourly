"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_NOTICE_COST, supportNoticeText } from "@/lib/support-notice";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/**
 * The owner's switch for the "chip in" note on Today. Off by default. When on, everyone signed in (except sample
 * accounts) sees the note on Today until they press "Not now". Nothing is emailed.
 */
export function SupportNoticeCard() {
  const utils = trpc.useUtils();
  const current = trpc.insights.supportNotice.useQuery(undefined, { staleTime: 60_000 });
  const save = trpc.insights.setSupportNotice.useMutation();
  const [on, setOn] = useState(false);
  const [cost, setCost] = useState("");
  useEffect(() => {
    if (!current.data) return;
    setOn(current.data.on);
    setCost(current.data.cost === null ? "" : String(current.data.cost));
  }, [current.data]);

  const amount = Number(cost);
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= MAX_NOTICE_COST;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    try {
      await save.mutateAsync({ on, cost: amount });
      await utils.insights.supportNotice.invalidate();
      toast.success(on ? "The note is on. People see it on Today." : "Saved. The note is off.");
    } catch (err) {
      toastError(err, "Couldn't save that.");
    }
  }

  return (
    <SectionCard
      title="Ask for support"
      description="A short note on Today saying what hosting costs and linking to your sponsors page. It is shown inside the app only, nothing is emailed."
      onSubmit={submit}
    >
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-5" />
        Show the note on Today
      </label>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="support-notice-cost">What hosting costs a month (US dollars, whole number)</label>
        <Input
          id="support-notice-cost"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_NOTICE_COST}
          step={1}
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="max-w-40"
        />
      </div>
      {valid && <p className="text-muted-foreground text-sm">People would read: "{supportNoticeText(amount)}"</p>}
      <Button type="submit" className="self-start" disabled={!valid || save.isPending}>
        {save.isPending ? "Saving…" : "Save"}
      </Button>
    </SectionCard>
  );
}
