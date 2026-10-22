"use client";

import { useState } from "react";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DataPanelHead } from "@/components/data-panel-head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOutOfDevice } from "@/lib/sign-out";
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
      await signOutOfDevice({ callbackUrl: "/" }, true);
    } catch (err) {
      toastError(err, "Couldn't delete the account.");
    }
  }

  return (
    <section
      aria-label="Delete account"
      className="grid gap-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-destructive/40 sm:p-6"
    >
      <div className="grid gap-3">
        <DataPanelHead icon={Trash2} title="Delete my account" danger>
          This removes your clients, projects, time entries, invoices and settings for good, and cannot be undone. Use
          &ldquo;Export&rdquo; above first if you want a copy.
        </DataPanelHead>
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
          <Button
            type="button"
            variant="outline"
            className="h-11 justify-self-start rounded-full px-5 text-destructive"
            onClick={() => setOpen(true)}
          >
            Delete my account…
          </Button>
        )}
      </div>
    </section>
  );
}
