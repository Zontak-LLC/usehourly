"use client";

import { useState } from "react";

import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { trpc } from "@/lib/trpc";

import type { AccountMe } from "./account-section";

export function InvoiceFooterCard({ me }: { me: AccountMe }) {
  const utils = trpc.useUtils();
  const setBranding = trpc.account.setInvoiceBranding.useMutation();
  // The checkbox responds at once; the saved value takes over when the server answers (or the change is undone).
  const [brandingChoice, setBrandingChoice] = useState<boolean | null>(null);

  return (
    <SectionCard
      title="Invoice footer"
      description={
        <>
          A small &ldquo;Made with UseHourly&rdquo; line at the bottom of each page of your invoices. It helps other
          freelancers find a free tool. Turn it off any time; it applies to invoices you issue from now on.
        </>
      }
    >
      <label className="flex min-h-8 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={brandingChoice ?? me.invoice_branding}
          disabled={setBranding.isPending}
          onChange={async (e) => {
            const enabled = e.target.checked;
            setBrandingChoice(enabled);
            try {
              await setBranding.mutateAsync({ enabled });
              await utils.account.me.invalidate();
              toast.success(enabled ? "The footer line is on." : "The footer line is off.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Couldn't save that.");
            } finally {
              setBrandingChoice(null);
            }
          }}
        />
        Show &ldquo;Made with UseHourly&rdquo; on my invoices
      </label>
    </SectionCard>
  );
}
