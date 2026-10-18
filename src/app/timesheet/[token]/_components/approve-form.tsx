"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** The client's approval: a name and an optional note. No account, nothing is billed here. */
export function ApproveForm({ token }: { token: string }) {
  const router = useRouter();
  const approve = trpc.timesheetShare.approve.useMutation();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await approve.mutateAsync({ token, name, note });
      router.refresh();
    } catch (err) {
      toastError(err, "Couldn't record your approval. Please try again.");
    }
  }

  return (
    <form method="post" onSubmit={submit} className="flex flex-col gap-3 rounded-xl border bg-card p-4 print:hidden">
      <div>
        <h2 className="font-semibold text-base">Do these hours look right?</h2>
        <p className="text-muted-foreground text-sm">
          Type your name to approve them. This only tells {`the sender`} you agree with the hours; nothing is paid or
          billed here.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="approver">Your name</Label>
        <Input
          id="approver"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="name"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="approver-note">A note for them (optional)</Label>
        <Textarea id="approver-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
      </div>
      <Button type="submit" disabled={approve.isPending || name.trim() === ""} className="self-start">
        {approve.isPending ? "Saving…" : "Approve these hours"}
      </Button>
    </form>
  );
}
