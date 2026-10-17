"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { signIn, signOut } from "next-auth/react";
import { toast } from "sonner";

import { ApiTokensCard } from "@/components/api-tokens-card";
import { ClaimDemoCard } from "@/components/claim-demo-card";
import { ExportEverything } from "@/components/export-everything";
import { ImportTime } from "@/components/import-time";
import { SupportHourly } from "@/components/support-hourly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fileToLogo } from "@/lib/logo";
import { trpc } from "@/lib/trpc";

const SECTIONS = [
  { id: "account", label: "Your account" },
  { id: "invoices", label: "Invoices" },
  { id: "data", label: "Your data" },
  { id: "ai", label: "AI assistants" },
  { id: "support", label: "Support" },
] as const;

/** A labelled group of cards, so a long page reads as a few clear topics. */
function Section({
  id,
  title,
  description,
  children,
}: {
  id: (typeof SECTIONS)[number]["id"];
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="flex scroll-mt-20 flex-col gap-3">
      <div className="border-b pb-2">
        <h2 id={`${id}-heading`} className="font-semibold text-lg">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function AccountView() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const me = trpc.account.me.useQuery();
  const updateProfile = trpc.account.updateProfile.useMutation();
  const changePassword = trpc.account.changePassword.useMutation();
  const updateBusiness = trpc.account.updateBusiness.useMutation();
  const signOutEverywhere = trpc.account.signOutEverywhere.useMutation();
  const setBranding = trpc.account.setInvoiceBranding.useMutation();
  const setReminder = trpc.account.setWeeklyReminder.useMutation();
  // Checkboxes respond at once; the saved value takes over when the server answers (or the change is undone).
  const [brandingChoice, setBrandingChoice] = useState<boolean | null>(null);
  const [reminderChoice, setReminderChoice] = useState<boolean | null>(null);
  const emailEnabled = trpc.account.emailEnabled.useQuery();
  const sendVerification = trpc.account.sendVerification.useMutation();
  const [verificationSent, setVerificationSent] = useState(false);
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
      // Every device was signed out by the change. Sign this one straight back in.
      const res = await signIn("credentials", {
        email: me.data?.email ?? "",
        password: String(fd.get("next")),
        redirect: false,
      });
      toast.success(
        res?.error ? "Password changed. Please log in again." : "Password changed. Other devices have been signed out.",
      );
      if (res?.error) await signOut({ callbackUrl: "/auth/v2/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change your password.");
    }
  }

  if (me.isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-xl" />;
  if (me.error || !me.data) {
    return <p className="text-destructive text-sm">Couldn't load your account: {me.error?.message}</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="font-semibold text-xl">Account</h1>
        <nav aria-label="Account sections" className="flex flex-wrap gap-2 text-sm">
          {SECTIONS.map((x) => (
            <a key={x.id} href={`#${x.id}`} className="rounded-full border px-3 py-1 hover:bg-muted">
              {x.label}
            </a>
          ))}
        </nav>
      </div>

      <Section id="account" title="Your account" description="Your name, your email, and how you sign in.">
        {me.data.is_demo ? (
          <ClaimDemoCard />
        ) : (
          <form onSubmit={saveProfile} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <h3 className="font-medium">Name and email</h3>
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={me.data.name ?? ""} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={me.data.email} disabled />
              {me.data.email_verified_at ? (
                <p className="text-emerald-700 text-xs dark:text-emerald-400">Email confirmed.</p>
              ) : emailEnabled.data?.enabled ? (
                <p className="text-muted-foreground text-xs">
                  Not confirmed yet.{" "}
                  {verificationSent ? (
                    "We sent you a link. Check your inbox."
                  ) : (
                    <button
                      type="button"
                      className="underline"
                      disabled={sendVerification.isPending}
                      onClick={async () => {
                        try {
                          await sendVerification.mutateAsync();
                          setVerificationSent(true);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Couldn't send the email.");
                        }
                      }}
                    >
                      Send me a confirmation email
                    </button>
                  )}
                </p>
              ) : null}
            </div>
            <Button type="submit" className="self-start" disabled={updateProfile.isPending}>
              Save
            </Button>
          </form>
        )}

        {!me.data.is_demo && (
          <form onSubmit={savePassword} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div>
              <h3 className="font-medium">Change password</h3>
              <p className="text-muted-foreground text-sm">
                Changing it signs out your other devices and stops any AI assistant access tokens.
              </p>
            </div>
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
        )}

        <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div>
            <h3 className="font-medium">Sign out</h3>
            <p className="text-muted-foreground text-sm">
              Log out here, or on every device at once. Signing out everywhere also stops every AI assistant access
              token.
            </p>
          </div>
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
                  toast.error(err instanceof Error ? err.message : "Couldn't sign out your other devices.");
                }
              }}
            >
              Log out on all devices
            </Button>
          </div>
        </section>

        {!me.data.is_demo && (
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div>
              <h3 className="font-medium">Friday reminder</h3>
              <p className="text-muted-foreground text-sm">
                One email on Friday afternoon with your week so far, so nothing goes unlogged. Turn it off any time,
                here or with the link in the email.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={reminderChoice ?? me.data.weekly_reminder}
                disabled={setReminder.isPending || !emailEnabled.data?.enabled || !me.data.email_verified_at}
                onChange={async (e) => {
                  try {
                    await setReminder.mutateAsync({
                      enabled: e.target.checked,
                      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    });
                    await utils.account.me.invalidate();
                    toast.success(
                      e.target.checked ? "You'll get a reminder on Friday afternoons." : "The reminder is off.",
                    );
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Couldn't save that.");
                  }
                }}
              />
              Email me on Friday afternoon with my week so far
            </label>
            {emailEnabled.data && !emailEnabled.data.enabled && (
              <p className="text-muted-foreground text-xs">
                Email isn&rsquo;t set up on this server yet, so this can&rsquo;t be turned on.
              </p>
            )}
            {emailEnabled.data?.enabled && !me.data.email_verified_at && (
              <p className="text-muted-foreground text-xs">Confirm your email address above to turn this on.</p>
            )}
          </section>
        )}
      </Section>

      <Section id="invoices" title="Invoices" description="The details printed on every invoice you send.">
        <form onSubmit={saveBusiness} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div>
            <h3 className="font-medium">Business details</h3>
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

        <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div>
            <h3 className="font-medium">Invoice footer</h3>
            <p className="text-muted-foreground text-sm">
              A small &ldquo;Made with UseHourly&rdquo; line at the bottom of each page of your invoices. It helps other
              freelancers find a free tool. Turn it off any time; it applies to invoices you issue from now on.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={brandingChoice ?? me.data.invoice_branding}
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
        </section>
      </Section>

      <Section
        id="data"
        title="Your data"
        description="Keep a copy of everything you have logged, or bring your history in from another tool."
      >
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div>
            <h3 className="font-medium">Download everything</h3>
            <p className="text-muted-foreground text-sm">
              Everything you have logged, every client and all time, as a zip of spreadsheets: one combined workbook,
              one per client, and plain CSV files.
            </p>
          </div>
          <ExportEverything className="self-start" />
        </section>

        <ImportTime />
      </Section>

      <Section
        id="ai"
        title="AI assistants"
        description="Let an assistant such as Claude read your time, log new entries and prepare invoices."
      >
        {me.data.is_demo ? (
          <p className="rounded-xl border bg-card p-4 text-muted-foreground text-sm">
            Create a free account to connect an AI assistant such as Claude.
          </p>
        ) : (
          <ApiTokensCard />
        )}
      </Section>

      <Section id="support" title="Support" description="UseHourly is free. If it saves you time, you can chip in.">
        <SupportHourly />
      </Section>
    </div>
  );
}
