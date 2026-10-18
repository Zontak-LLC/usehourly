"use client";

import { signIn, signOut } from "next-auth/react";
import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import type { AccountMe } from "./account-section";

export function PasswordNote() {
  return (
    <SectionCard
      title="Password"
      description={
        <>
          You sign in with GitHub or Google, so there is no password to change. If you also want one, use "Forgot
          password" on the log-in page.
        </>
      }
    />
  );
}

export function ChangePasswordCard({ me }: { me: AccountMe }) {
  const changePassword = trpc.account.changePassword.useMutation();

  async function savePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await changePassword.mutateAsync({
        currentPassword: String(fd.get("current")),
        newPassword: String(fd.get("next")),
      });
      form.reset();
      // Every device was signed out by the change. Sign this one straight back in.
      const res = await signIn("credentials", {
        email: me.email ?? "",
        password: String(fd.get("next")),
        redirect: false,
      });
      toast.success(
        res?.error ? "Password changed. Please log in again." : "Password changed. Other devices have been signed out.",
      );
      if (res?.error) await signOut({ callbackUrl: "/auth/v2/login" });
    } catch (err) {
      toastError(err, "Couldn't change your password.");
    }
  }

  return (
    <SectionCard
      onSubmit={savePassword}
      title="Change password"
      description="Changing it signs out your other devices and stops any AI assistant access tokens."
    >
      <div className="grid gap-1.5">
        <Label htmlFor="current">Current password</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="next">New password</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <Button type="submit" className="self-start" disabled={changePassword.isPending}>
        Change password
      </Button>
    </SectionCard>
  );
}

export function SignOutCard() {
  const signOutEverywhere = trpc.account.signOutEverywhere.useMutation();

  return (
    <SectionCard
      title="Sign out"
      description="Log out here, or on every device at once. Signing out everywhere also stops every AI assistant access token."
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => signOut({ callbackUrl: "/auth/v2/login" })}>
          Log out
        </Button>
        <Button
          variant="outline"
          disabled={signOutEverywhere.isPending}
          onClick={async () => {
            try {
              await signOutEverywhere.mutateAsync();
              await signOut({ callbackUrl: "/auth/v2/login" });
            } catch (err) {
              toastError(err, "Couldn't sign out your other devices.");
            }
          }}
        >
          Log out on all devices
        </Button>
      </div>
    </SectionCard>
  );
}
