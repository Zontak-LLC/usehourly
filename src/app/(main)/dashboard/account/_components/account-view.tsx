"use client";

import { ApiTokensCard } from "@/components/api-tokens-card";
import { ClaimDemoCard } from "@/components/claim-demo-card";
import { DeleteAccountCard } from "@/components/delete-account-card";
import { ExportEverything } from "@/components/export-everything";
import { ImportTime } from "@/components/import-time";
import { PageShell } from "@/components/page-shell";
import { SectionCard } from "@/components/section-card";
import { SupportHourly } from "@/components/support-hourly";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

import { SECTIONS, Section } from "./account-section";
import { BusinessDetailsCard } from "./business-details-card";
import { FridayReminderCard } from "./friday-reminder-card";
import { InvoiceFooterCard } from "./invoice-footer-card";
import { ProfileCard } from "./profile-card";
import { ChangePasswordCard, PasswordNote, SignOutCard } from "./security-cards";

export function AccountView() {
  const me = trpc.account.me.useQuery();
  const emailEnabled = trpc.account.emailEnabled.useQuery();

  if (me.isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-xl" />;
  if (me.error || !me.data) {
    return <p className="text-destructive text-sm">Couldn't load your account: {me.error?.message}</p>;
  }
  const account = me.data;

  return (
    <PageShell title="Account" description="Your details, invoices, data and connections. Jump to a section:" size="xl">
      {/* Icon over a word, like the top navigation, so the jump links look like the rest of the app's tabs. */}
      <nav aria-label="Account sections" className="grid grid-cols-5 gap-1">
        {SECTIONS.map((x) => (
          <a
            key={x.id}
            href={`#${x.id}`}
            className="flex min-h-14 flex-col items-center justify-start gap-1 rounded-lg px-1 pt-2 text-center font-medium text-foreground/80 text-xs leading-tight hover:bg-muted hover:text-foreground"
          >
            <x.icon className="size-5" aria-hidden />
            {x.label}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-8">
        <Section id="account" title="Your account" description="Your name, your email, and how you sign in.">
          {account.is_demo ? <ClaimDemoCard /> : <ProfileCard me={account} emailEnabled={emailEnabled.data} />}
          {!account.is_demo && !account.has_password && <PasswordNote />}
          {!account.is_demo && account.has_password && <ChangePasswordCard me={account} />}
          <SignOutCard />
          {!account.is_demo && <FridayReminderCard me={account} emailEnabled={emailEnabled.data} />}
        </Section>

        <Section id="invoices" title="Invoices" description="The details printed on every invoice you send.">
          <BusinessDetailsCard me={account} />
          <InvoiceFooterCard me={account} />
        </Section>

        <Section
          id="data"
          title="Your data"
          description="Keep a copy of everything you have logged, or bring your history in from another tool."
        >
          <SectionCard
            title="Download everything"
            description="Everything you have logged, every client and all time, as a zip of spreadsheets: one combined workbook, one per client, and plain CSV files."
          >
            <ExportEverything className="self-start" />
          </SectionCard>

          <ImportTime />

          {!account.is_demo && <DeleteAccountCard hasPassword={account.has_password} email={account.email} />}
        </Section>

        <Section
          id="ai"
          title="AI assistants"
          description="Let an assistant such as Claude read your time, log new entries and prepare invoices."
        >
          {account.is_demo ? (
            <SectionCard
              title="Create a free account first"
              description="Create a free account to connect an AI assistant such as Claude."
            />
          ) : (
            <ApiTokensCard />
          )}
        </Section>

        <Section id="support" title="Support" description="UseHourly is free. If it saves you time, you can chip in.">
          <SupportHourly />
        </Section>
      </div>
    </PageShell>
  );
}
