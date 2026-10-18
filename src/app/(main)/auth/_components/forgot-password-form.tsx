"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

export function ForgotPasswordForm() {
  const enabled = trpc.account.emailEnabled.useQuery();
  const request = trpc.account.requestPasswordReset.useMutation();
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await request.mutateAsync({ email: String(fd.get("email")) });
      setSent(true);
    } catch (err) {
      toastError(err, "Couldn't send the email. Please try again.");
    }
  }

  if (enabled.data && !enabled.data.enabled) {
    return (
      <p className="rounded-lg border bg-muted/40 p-4 text-sm">
        Resetting a password by email isn't set up on this site yet. Please write to the site owner and they can help
        you.
      </p>
    );
  }

  if (sent) {
    return (
      <p className="rounded-lg border bg-muted/40 p-4 text-sm">
        If that address has an account, we have sent a link to choose a new password. It works for 1 hour. Check your
        spam folder if it does not arrive.
      </p>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required />
      </div>
      <Button type="submit" disabled={request.isPending || enabled.isLoading}>
        {request.isPending ? "Sending…" : "Email me a reset link"}
      </Button>
    </form>
  );
}
