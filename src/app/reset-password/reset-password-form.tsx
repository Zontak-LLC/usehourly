"use client";

import { useState } from "react";

import Link from "next/link";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

export function ResetPasswordForm({ token }: { token: string }) {
  const reset = trpc.account.resetPassword.useMutation();
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <p className="rounded-lg border bg-muted/40 p-4 text-sm">
        This page needs the link from your email.{" "}
        <Link className="underline" href="/auth/v2/forgot-password">
          Ask for a new link
        </Link>
        .
      </p>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border bg-muted/40 p-4 text-sm">
          Your password is changed, and you were signed out everywhere. Log in with the new one.
        </p>
        <Button asChild className="w-full">
          <Link href="/auth/v2/login">Log in</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newPassword = String(fd.get("password"));
    if (newPassword !== String(fd.get("again"))) {
      toast.error("The two passwords are not the same.");
      return;
    }
    try {
      await reset.mutateAsync({ token, newPassword });
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change your password.");
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <p className="text-muted-foreground text-xs">At least 8 characters.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="again">New password again</Label>
        <Input id="again" name="again" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <Button type="submit" disabled={reset.isPending}>
        {reset.isPending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
