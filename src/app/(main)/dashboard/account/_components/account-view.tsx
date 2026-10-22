"use client";

import { AiPolishCard } from "@/components/ai-polish-card";
import { ApiTokensCard } from "@/components/api-tokens-card";
import { ClaimDemoCard } from "@/components/claim-demo-card";
import { PageShell } from "@/components/page-shell";
import { SectionCard } from "@/components/section-card";
import { SupportHourly } from "@/components/support-hourly";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

import { AccountChecklist } from "./account-checklist";
import { Section } from "./account-section";
import { AccountTabs, useAccountTab } from "./account-tabs";
import { BusinessDetailsCard } from "./business-details-card";
import { ConnectAssistant } from "./connect-assistant";
import { CurrencyCard } from "./currency-card";
import { DataHub } from "./data-hub";
import { FridayReminderCard } from "./friday-reminder-card";
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

      <div key={tab} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex flex-col gap-8">
        {tab === "account" && (
          <Section id="account" title="Your account" description="Your name, your email, and how you sign in.">
            {account.is_demo ? (
              <>
                <ClaimDemoCard />
                <SignOutCard />
              </>
            ) : (
              <div className="flex flex-col gap-6">
                <AccountChecklist me={account} />
                <div className="grid items-start gap-6 xl:grid-cols-2">
                  <ProfileCard me={account} emailEnabled={emailEnabled.data} />
                  <div className="flex flex-col gap-6">
                    <FridayReminderCard me={account} emailEnabled={emailEnabled.data} />
                    {account.has_password ? <ChangePasswordCard me={account} /> : <PasswordNote />}
                    <SignOutCard />
                  </div>
                </div>
              </div>
            )}
          </Section>
        )}
        {tab === "invoices" && (
          <Section id="invoices" title="Invoices" description="The details printed on every invoice you send.">
            <BusinessDetailsCard me={account} />
            <CurrencyCard me={account} />
          </Section>
        )}
        {tab === "data" && (
          <Section
            id="data"
            title="Your data"
            description="Keep a copy of everything you have logged, or bring your history in from another tool."
          >
            <DataHub account={account} />
          </Section>
        )}
        {tab === "ai" && (
          <Section
            id="ai"
            title="AI assistants"
            description="Connect an assistant such as Claude or ChatGPT to UseHourly."
          >
            {account.is_demo ? (
              <SectionCard
                title="Create a free account first"
                description="Create a free account to connect an AI assistant such as Claude."
              />
            ) : (
              <>
                <ConnectAssistant />
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
