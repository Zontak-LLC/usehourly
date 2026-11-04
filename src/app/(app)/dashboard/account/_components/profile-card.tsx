"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { AvatarCropper } from "@/components/avatar-cropper";
import { LogoPicker } from "@/components/logo-picker";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAvatarUpload } from "@/components/use-avatar-upload";
import { feature } from "@/lib/features";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import type { AccountMe, EmailEnabled } from "./account-section";

export function ProfileCard({ me, emailEnabled }: { me: AccountMe; emailEnabled: EmailEnabled }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const updateProfile = trpc.account.updateProfile.useMutation();
  const avatar = useAvatarUpload();

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await updateProfile.mutateAsync({ name: String(fd.get("name")) });
      await utils.account.me.invalidate();
      router.refresh(); // refresh the sidebar's server-rendered name
      toast.success("Profile updated.");
    } catch (err) {
      toastError(err, "Couldn't update your profile.");
    }
  }

  return (
    <SectionCard onSubmit={saveProfile} title="Name and email">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={me.name ?? ""} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={me.email} disabled />
        {me.email_verified_at ? (
          <p className="text-success text-xs">Email confirmed.</p>
        ) : emailEnabled?.enabled ? (
          <ConfirmEmailHint />
        ) : null}
      </div>
      {feature("avatar") && (
        <div className="grid gap-1.5">
          <Label>Picture</Label>
          <LogoPicker
            value={me.avatar}
            onPick={avatar.pick}
            onRemove={() => void avatar.remove()}
            name="picture"
            compact
            addLabel="Add a picture"
          />
          <AvatarCropper crop={avatar.crop} />
          <p className="text-muted-foreground text-xs">Shown beside your name at the top right. Only you see it.</p>
        </div>
      )}
      <Button type="submit" className="self-start" disabled={updateProfile.isPending}>
        Save
      </Button>
    </SectionCard>
  );
}

function ConfirmEmailHint() {
  const sendVerification = trpc.account.sendVerification.useMutation();
  const [verificationSent, setVerificationSent] = useState(false);

  return (
    <p className="text-muted-foreground text-xs">
      {feature("weeklyReminder") || feature("invoiceEmail")
        ? "Not confirmed yet. Confirming it turns on the Friday reminder and lets you email invoices. "
        : "Not confirmed yet. Confirming it proves the address is yours. "}
      {verificationSent ? (
        "We sent you a link. Check your inbox."
      ) : (
        <button
          type="button"
          className="inline-block py-2 underline"
          disabled={sendVerification.isPending}
          onClick={async () => {
            try {
              await sendVerification.mutateAsync();
              setVerificationSent(true);
            } catch (err) {
              toastError(err, "Couldn't send the email.");
            }
          }}
        >
          Send me a confirmation email
        </button>
      )}
    </p>
  );
}
