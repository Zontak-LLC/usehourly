"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { signOut } from "next-auth/react";
import { toast } from "sonner";

import { ExportEverything } from "@/components/export-everything";
import { SupportHourly } from "@/components/support-hourly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fileToLogo } from "@/lib/logo";
import { trpc } from "@/lib/trpc";

export function AccountView() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const me = trpc.account.me.useQuery();
  const updateProfile = trpc.account.updateProfile.useMutation();
  const changePassword = trpc.account.changePassword.useMutation();
  const updateBusiness = trpc.account.updateBusiness.useMutation();
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => setLogo(me.data?.logo ?? null), [me.data?.logo]);

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    try {
      setLogo(await fileToLogo(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't use that image.");
    }
  }

  async function saveBusiness(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await updateBusiness.mutateAsync({
        businessName: String(fd.get("businessName") ?? ""),
        ein: String(fd.get("ein") ?? ""),
        address: String(fd.get("address") ?? ""),
        paymentInstructions: String(fd.get("paymentInstructions") ?? ""),
        logo,
      });
      await utils.account.me.invalidate();
      toast.success("Business details saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save business details.");
    }
  }

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await updateProfile.mutateAsync({ name: String(fd.get("name")) });
      await utils.account.me.invalidate();
      router.refresh(); // refresh the sidebar's server-rendered name
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update your profile.");
    }
  }

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
      toast.success("Password changed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change your password.");
    }
  }

  if (me.isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-xl" />;
  if (me.error || !me.data) {
    return <p className="text-destructive text-sm">Couldn't load your account: {me.error?.message}</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="font-semibold text-xl">Account</h1>

      <form onSubmit={saveProfile} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 className="font-medium">Profile</h2>
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={me.data.name ?? ""} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={me.data.email} disabled />
        </div>
        <Button type="submit" className="self-start" disabled={updateProfile.isPending}>
          Save
        </Button>
      </form>

      <form onSubmit={saveBusiness} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div>
          <h2 className="font-medium">Business details</h2>
          <p className="text-muted-foreground text-sm">Printed on the invoices you send to clients.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="businessName">Business name</Label>
          <Input
            id="businessName"
            name="businessName"
            defaultValue={me.data.business_name ?? ""}
            placeholder={me.data.name ?? "Your name or company"}
            maxLength={100}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ein">EIN</Label>
          <Input id="ein" name="ein" defaultValue={me.data.ein ?? ""} placeholder="12-3456789" inputMode="numeric" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="address">Address</Label>
          <Textarea
            id="address"
            name="address"
            defaultValue={me.data.address ?? ""}
            placeholder={"123 Main St\nSpringfield, IL 62701"}
            rows={3}
            maxLength={300}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="paymentInstructions">How to pay</Label>
          <Textarea
            id="paymentInstructions"
            name="paymentInstructions"
            defaultValue={me.data.payment_instructions ?? ""}
            placeholder={"Pay by ACH\nAccount name: …\nRouting number: …\nAccount number: …"}
            rows={4}
            maxLength={500}
          />
          <p className="text-muted-foreground text-xs">Printed on every invoice. Leave empty to print nothing.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="logo">Logo</Label>
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-32 items-center justify-center rounded-lg border bg-white">
              {logo ? (
                // biome-ignore lint/performance/noImgElement: a data: URL preview, nothing to optimize
                <img src={logo} alt="Logo preview" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-muted-foreground text-xs">No logo</span>
              )}
            </div>
            <div className="flex flex-col items-start gap-1">
              <Input id="logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={pickLogo} />
              {logo && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setLogo(null)}>
                  Remove logo
                </Button>
              )}
            </div>
          </div>
        </div>
        <Button type="submit" className="self-start" disabled={updateBusiness.isPending}>
          Save business details
        </Button>
      </form>

      <form onSubmit={savePassword} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 className="font-medium">Change password</h2>
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
      </form>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div>
          <h2 className="font-medium">Your data</h2>
          <p className="text-muted-foreground text-sm">
            Everything you have logged, every client and all time, as a zip of spreadsheets: one combined workbook, one
            per client, and plain CSV files.
          </p>
        </div>
        <ExportEverything className="self-start" />
      </section>

      <SupportHourly />

      <Button variant="outline" className="self-start" onClick={() => signOut({ callbackUrl: "/auth/v2/login" })}>
        Log out
      </Button>
    </div>
  );
}
