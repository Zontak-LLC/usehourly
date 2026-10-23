"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { ExampleInvoice } from "@/components/example-invoice";
import { FormStep } from "@/components/form-step";
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

  // The fields are held here so the sketch beside them can show what is typed, as it is typed.
  const [name, setName] = useState(me.business_name ?? "");
  const [ein, setEin] = useState(me.ein ?? "");
  const [address, setAddress] = useState(me.address ?? "");
  const [pay, setPay] = useState(me.payment_instructions ?? "");

  return (
    <SectionCard
      onSubmit={saveBusiness}
      title="Business details"
      description="Printed on the invoices you send to clients."
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-6">
          <FormStep n={1} title="Who is sending the invoice?">
            <div className="grid gap-1.5">
              <Label htmlFor="businessName">Business name</Label>
              <Input
                id="businessName"
                name="businessName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={me.name ?? "Your name or company"}
                maxLength={100}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ein">Tax ID (EIN)</Label>
              <Input
                id="ein"
                name="ein"
                value={ein}
                onChange={(e) => setEin(e.target.value)}
                placeholder="12-3456789"
                inputMode="numeric"
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                name="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={"123 Main St\nSpringfield, IL 62701"}
                rows={3}
                maxLength={300}
              />
            </div>
          </FormStep>
          <FormStep n={2} title="How do you get paid?">
            <div className="grid gap-1.5">
              <Label htmlFor="paymentInstructions">How to pay</Label>
              <Textarea
                id="paymentInstructions"
                name="paymentInstructions"
                value={pay}
                onChange={(e) => setPay(e.target.value)}
                placeholder={"Pay by ACH\nAccount name: …\nRouting number: …\nAccount number: …"}
                rows={4}
                maxLength={500}
              />
              <p className="text-muted-foreground text-xs">Printed on every invoice. Leave empty to print nothing.</p>
            </div>
          </FormStep>
          <FormStep n={3} title="Your logo">
            <LogoPicker
              value={logo}
              onPick={pickLogo}
              onRemove={() => setLogo(null)}
              name="business logo"
              hint="Printed at the top of every invoice you send."
            />
          </FormStep>
          <Button type="submit" className="h-10 self-start px-5" disabled={updateBusiness.isPending}>
            Save business details
          </Button>
        </div>

        {/* A finished invoice, to see where these details print. */}
        <div className="lg:pt-8">
          <ExampleInvoice />
        </div>
      </div>
    </SectionCard>
  );
}
