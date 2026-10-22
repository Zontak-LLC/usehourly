"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

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

  // The fields are held here so the letterhead beside them can show what is typed, as it is typed.
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
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
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
              <Label htmlFor="ein">EIN</Label>
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
            <LogoPicker value={logo} onPick={pickLogo} onRemove={() => setLogo(null)} name="business logo" />
          </FormStep>
          <Button type="submit" variant="primary" className="self-start" disabled={updateBusiness.isPending}>
            Save business details
          </Button>
        </div>

        {/* The top of the invoice, drawn from what is typed: the same things in the same places as the PDF. */}
        <aside
          aria-label="How your invoice will start"
          className="relative flex flex-col gap-5 overflow-hidden rounded-2xl border bg-white p-8 text-[#12151b] shadow-[var(--shadow-sheet)] lg:sticky lg:top-32"
        >
          <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-amber" />
          <div className="flex items-start justify-between gap-3">
            {logo ? (
              // biome-ignore lint/performance/noImgElement: a small data: URL picture
              <img src={logo} alt="" className="max-h-20 max-w-48 object-contain" />
            ) : (
              <span className="font-display font-extrabold text-2xl">{name || me.name || "Your business"}</span>
            )}
            <span className="text-right">
              <span className="block font-display font-extrabold text-2xl tracking-tight">INVOICE</span>
              <span className="block font-mono text-[#8b8f98] text-xs">INV-2026-001</span>
            </span>
          </div>
          <div className="text-sm leading-relaxed">
            {logo && <p className="font-bold font-display text-lg">{name || me.name}</p>}
            <p className="whitespace-pre-line text-[#4b5160]">{address || "Your address appears here"}</p>
            {ein && <p className="mt-1 font-mono text-[#4b5160]">EIN {ein}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-mono text-[#8b8f98] text-xs uppercase tracking-widest">Bill to</p>
              <p className="mt-1 font-semibold">Your client</p>
              <p className="text-[#8b8f98]">Their address</p>
            </div>
            <div>
              <p className="font-mono text-[#8b8f98] text-xs uppercase tracking-widest">Due</p>
              <p className="mt-1 font-semibold">In 30 days</p>
            </div>
          </div>
          <div aria-hidden className="text-sm">
            <div className="flex justify-between border-[#12151b] border-b pb-1 font-mono text-[#8b8f98] text-xs uppercase tracking-widest">
              <span>Project</span>
              <span>Amount</span>
            </div>
            {[
              ["Website · 12.0 h", "$540.00"],
              ["Support · 3.5 h", "$157.50"],
            ].map(([what, amount]) => (
              <div key={what} className="flex justify-between border-[#e3e6ec] border-b py-2 text-[#4b5160]">
                <span>{what}</span>
                <span className="font-mono">{amount}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between pt-3">
              <span className="font-mono text-[#8b8f98] text-xs uppercase tracking-widest">Total</span>
              <span className="font-display font-extrabold text-2xl">$697.50</span>
            </div>
          </div>
          <div className="rounded-xl bg-[#f6f7f9] p-4 text-sm">
            <p className="font-mono text-[#8b8f98] text-xs uppercase tracking-widest">How to pay</p>
            <p className="mt-1 whitespace-pre-line text-[#4b5160]">{pay || "Nothing printed"}</p>
          </div>
          <p className="text-center text-[#8b8f98] text-xs">
            The lines above are an example. Yours come from your time.
          </p>
        </aside>
      </div>
    </SectionCard>
  );
}
