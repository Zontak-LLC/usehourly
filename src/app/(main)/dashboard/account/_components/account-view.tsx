"use client";

import { AccountingExport } from "@/components/accounting-export";
import { AiPolishCard } from "@/components/ai-polish-card";
import { ApiTokensCard } from "@/components/api-tokens-card";
import { ClaimDemoCard } from "@/components/claim-demo-card";
import { DeleteAccountCard } from "@/components/delete-account-card";
import { ExportEverything } from "@/components/export-everything";
import { GuideLink } from "@/components/guide-link";
import { ImportTime } from "@/components/import-time";
import { LocalFirstCard } from "@/components/local-first-card";
import { PageShell } from "@/components/page-shell";
import { SectionCard } from "@/components/section-card";
import { SupportHourly } from "@/components/support-hourly";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

import { Section } from "./account-section";
import { AccountTabs, useAccountTab } from "./account-tabs";
import { BusinessDetailsCard } from "./business-details-card";
import { CurrencyCard } from "./currency-card";
import { FridayReminderCard } from "./friday-reminder-card";
import { InvoiceFooterCard } from "./invoice-footer-card";
import { MemberBadge } from "./member-badge";
import { ProfileCard } from "./profile-card";
import { ChangePasswordCard, PasswordNote, SignOutCard } from "./security-cards";

export function AccountView() {
  const [tab, setTab] = useAccountTab();
  const me = trpc.account.me.useQuery();
  const emailEnabled = trpc.account.emailEnabled.useQuery();

  if (me.isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-xl" />;
  if (me.error || !me.data) {
    return <p className="text-destructive text-sm">Couldn't load your account: {me.error?.message}</p>;
  }
  const account = me.data;

  return (
    <PageShell nav="account" title="Account" description="Your details, invoices, data and connections.">
      <AccountTabs tab={tab} onTab={setTab} />

      <div
        key={tab}
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="flex flex-col gap-8 motion-safe:animate-[settle_0.45s_ease-out_both]"
      >
        {tab === "account" && (
          <Section id="account" title="Your account" description="Your name, your email, and how you sign in.">
            {!account.is_demo && <MemberBadge me={account} />}
            {account.is_demo ? <ClaimDemoCard /> : <ProfileCard me={account} emailEnabled={emailEnabled.data} />}
            {!account.is_demo && !account.has_password && <PasswordNote />}
            {!account.is_demo && account.has_password && <ChangePasswordCard me={account} />}
            <SignOutCard />
            {!account.is_demo && <FridayReminderCard me={account} emailEnabled={emailEnabled.data} />}
          </Section>
        )}
        {tab === "invoices" && (
          <Section id="invoices" title="Invoices" description="The details printed on every invoice you send.">
            <BusinessDetailsCard me={account} />
            <CurrencyCard me={account} />
            <InvoiceFooterCard me={account} />
          </Section>
        )}
        {tab === "data" && (
          <Section
            id="data"
            title="Your data"
            description="Keep a copy of everything you have logged, or bring your history in from another tool."
          >
            <SectionCard
              title="Download everything"
              description="Everything you have logged, every client and all time, as a zip of spreadsheets: one combined workbook, one per client, and plain CSV files."
            >
              <ExportEverything big className="self-start" />
            </SectionCard>

            <SectionCard
              title={
                <span className="inline-flex items-center gap-1">
                  Send invoices to your accounting app <GuideLink topic="xero-quickbooks" label="Xero and QuickBooks" />
                </span>
              }
              description="Your invoices as a file Xero or QuickBooks Online can import, or a list of payments received. Days you marked non-billable are already left off every invoice."
            >
              <AccountingExport />
            </SectionCard>

            <ImportTime />

            {!account.is_demo && <LocalFirstCard />}

            {!account.is_demo && <DeleteAccountCard hasPassword={account.has_password} email={account.email} />}
          </Section>
        )}
        {tab === "ai" && (
          <Section
            id="ai"
            title="AI assistants"
            description="Let an assistant such as Claude read your time, log new entries and prepare invoices, or use your own AI key to polish descriptions."
          >
            {account.is_demo ? (
              <SectionCard
                title="Create a free account first"
                description="Create a free account to connect an AI assistant such as Claude."
              />
            ) : (
              <>
                <ApiTokensCard />
                <AiPolishCard />
              </>
            )}
          </Section>
        )}
      </div>
      <SupportHourly variant="line" />
    </PageShell>
  );
}
