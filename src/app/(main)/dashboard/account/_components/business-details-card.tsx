"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { LogoPicker } from "@/components/logo-picker";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fileToLogo } from "@/lib/logo";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import type { AccountMe } from "./account-section";

export function BusinessDetailsCard({ me }: { me: AccountMe }) {
  const utils = trpc.useUtils();
  const updateBusiness = trpc.account.updateBusiness.useMutation();
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => setLogo(me.logo ?? null), [me.logo]);

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    try {
      setLogo(await fileToLogo(file));
    } catch (err) {
      toastError(err, "Couldn't use that image.");
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
      toastError(err, "Couldn't save business details.");
    }
  }

  return (
    <SectionCard
      onSubmit={saveBusiness}
      title="Business details"
      description="Printed on the invoices you send to clients."
    >
      <div className="grid gap-1.5">
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          name="businessName"
          defaultValue={me.business_name ?? ""}
          placeholder={me.name ?? "Your name or company"}
          maxLength={100}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ein">EIN</Label>
        <Input id="ein" name="ein" defaultValue={me.ein ?? ""} placeholder="12-3456789" inputMode="numeric" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          name="address"
          defaultValue={me.address ?? ""}
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
          defaultValue={me.payment_instructions ?? ""}
          placeholder={"Pay by ACH\nAccount name: …\nRouting number: …\nAccount number: …"}
          rows={4}
          maxLength={500}
        />
        <p className="text-muted-foreground text-xs">Printed on every invoice. Leave empty to print nothing.</p>
      </div>
      <div className="grid gap-1.5">
        <Label>Logo</Label>
        <LogoPicker value={logo} onPick={pickLogo} onRemove={() => setLogo(null)} name="business logo" />
      </div>
      <Button type="submit" className="self-start" disabled={updateBusiness.isPending}>
        Save business details
      </Button>
    </SectionCard>
  );
}
