"use client";

import { AiPolishCard } from "@/components/ai-polish-card";
import { ApiTokensCard } from "@/components/api-tokens-card";
import { ClaimDemoCard } from "@/components/claim-demo-card";
import { PageShell } from "@/components/page-shell";
import { SectionCard } from "@/components/section-card";
import { SupportHourly } from "@/components/support-hourly";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

import { Section } from "./account-section";
import { AccountTabs, useAccountTab } from "./account-tabs";
import { BusinessDetailsCard } from "./business-details-card";
import { CurrencyCard } from "./currency-card";
import { DataHub } from "./data-hub";
import { AssistantLink, DataVault } from "./data-vault";
import { FridayReminderCard } from "./friday-reminder-card";
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

      <div key={tab} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex flex-col gap-8">
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
          </Section>
        )}
        {tab === "data" && (
          <Section
            id="data"
            title="Your data"
            description="Keep a copy of everything you have logged, or bring your history in from another tool."
          >
            <DataVault />
            <DataHub account={account} />
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
                <AssistantLink />
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
