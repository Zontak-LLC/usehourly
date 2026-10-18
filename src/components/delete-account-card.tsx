"use client";

import { useState } from "react";

import { signOut } from "next-auth/react";
import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** Deleting the account is permanent, so it hides behind one extra click and asks for the password (or the email, for GitHub/Google accounts). */
export function DeleteAccountCard({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const del = trpc.account.deleteAccount.useMutation();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await del.mutateAsync({ confirm });
      toast.success("Your account and data were deleted.");
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      toastError(err, "Couldn't delete the account.");
    }
  }

  return (
    <SectionCard
      tone="danger"
      title="Delete my account"
      description="This removes your clients, projects, time entries, invoices and settings for good, and cannot be undone. Use “Export everything” above first if you want a copy."
    >
      {open ? (
        <form method="post" onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="delete-confirm">
              {hasPassword ? "Type your password to confirm" : `Type your email (${email}) to confirm`}
            </Label>
            <Input
              id="delete-confirm"
              type={hasPassword ? "password" : "email"}
              autoComplete={hasPassword ? "current-password" : "off"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" disabled={del.isPending || confirm === ""}>
              {del.isPending ? "Deleting…" : "Delete everything"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setConfirm("");
              }}
            >
              Keep my account
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" className="self-start text-destructive" onClick={() => setOpen(true)}>
          Delete my account…
        </Button>
      )}
    </SectionCard>
  );
}
