"use client";

import { AiPolishCard } from "@/components/ai-polish-card";
import { ApiTokensCard } from "@/components/api-tokens-card";
import { ClaimDemoCard } from "@/components/claim-demo-card";
import { DeleteAccountCard } from "@/components/delete-account-card";
import { SearchField } from "@/components/global-search";
import { PageShell } from "@/components/page-shell";
import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocationHash } from "@/components/use-location-hash";
import { ACCOUNT_SECTION_LABELS, type AccountSectionId, accountSectionFromHash } from "@/lib/account-sections";
import { feature } from "@/lib/features";
import { trpc } from "@/lib/trpc";

import { AccountChecklist } from "./account-checklist";
import { Section } from "./account-section";
import { AccountSectionList } from "./account-section-list";
import { BusinessDetailsCard } from "./business-details-card";
import { ConnectAssistant } from "./connect-assistant";
import { CurrencyCard } from "./currency-card";
import { DataHub } from "./data-hub";
import { FridayReminderCard } from "./friday-reminder-card";
import { ProfileCard } from "./profile-card";
import { ChangePasswordCard, PasswordNote, SignOutCard } from "./security-cards";
import { TaxCard } from "./tax-card";

const TITLES = ACCOUNT_SECTION_LABELS;

/**
 * Account as a split view like Clients (issue 283): the sections on the left, each with one status line, and the chosen
 * section's panels on the right. The open section is the address's #part (`#data`), so a link, a search result or a
 * reload opens it; with none a wide screen opens Your account and a phone shows the list.
 */
export function AccountView() {
  // Every query the list needs starts in this render, so they go out with the account as ONE batched request.
  const me = trpc.account.me.useQuery();
  const emailEnabled = trpc.account.emailEnabled.useQuery();
  const clients = trpc.clients.list.useQuery();
  const tokens = trpc.account.listApiTokens.useQuery();
  const open = accountSectionFromHash(useLocationHash());

  if (me.isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-xl" />;
  if (me.error || !me.data) {
    return <p className="text-destructive text-sm">Couldn't load your account: {me.error?.message}</p>;
  }
  const account = me.data;

  const blocks: Record<AccountSectionId, React.ReactNode> = {
    account: (
      <Section id="account" title={TITLES.account} description="Your name, your email, and how you sign in.">
        {account.is_demo ? (
          <>
            <ClaimDemoCard />
            <SignOutCard />
          </>
        ) : (
          <div className="flex flex-col gap-6">
            <AccountChecklist me={account} />
            <div className="grid items-start gap-6">
              <ProfileCard me={account} emailEnabled={emailEnabled.data} />
              <div className="flex flex-col gap-6">
                {feature("weeklyReminder") && <FridayReminderCard me={account} emailEnabled={emailEnabled.data} />}
                {account.has_password ? <ChangePasswordCard me={account} /> : <PasswordNote />}
                <SignOutCard />
                <DeleteAccountCard hasPassword={account.has_password} email={account.email} />
              </div>
            </div>
          </div>
        )}
      </Section>
    ),
    invoices: (
      <Section id="invoices" title={TITLES.invoices} description="The details printed on every invoice you send.">
        <BusinessDetailsCard me={account} />
        <CurrencyCard me={account} />
        {feature("invoiceTax") && <TaxCard me={account} />}
      </Section>
    ),
    data: (
      <Section
        id="data"
        title={TITLES.data}
        description={
          feature("importTime") || feature("localFirst")
            ? "Export it, import it, or keep a copy."
            : "Take it with you, or delete it."
        }
      >
        <DataHub account={account} />
      </Section>
    ),
    ai: (
      <Section
        id="ai"
        title={TITLES.ai}
        description="API tokens for apps and scripts, and connecting an assistant such as Claude or ChatGPT."
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
            {feature("aiPolish") && <AiPolishCard />}
          </>
        )}
      </Section>
    ),
  };

  return (
    <PageShell nav="account" title="Account" description="Your details, invoices, data and connections.">
      <SearchField placeholder="Search settings: password, currency, export, delete…" className="w-full max-w-xl" />
      <AccountSectionList open={open} me={account} clients={clients.data} tokens={tokens.data}>
        {blocks[open ?? "account"]}
      </AccountSectionList>
    </PageShell>
  );
}
