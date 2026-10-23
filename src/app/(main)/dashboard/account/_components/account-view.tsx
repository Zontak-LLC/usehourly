"use client";

import { useEffect } from "react";

import { AiPolishCard } from "@/components/ai-polish-card";
import { ApiTokensCard } from "@/components/api-tokens-card";
import { ClaimDemoCard } from "@/components/claim-demo-card";
import { DeleteAccountCard } from "@/components/delete-account-card";
import { SearchField } from "@/components/global-search";
import { PageShell } from "@/components/page-shell";
import { SectionCard } from "@/components/section-card";
import { SupportHourly } from "@/components/support-hourly";
import { Skeleton } from "@/components/ui/skeleton";
import { feature } from "@/lib/features";
import { trpc } from "@/lib/trpc";

import { AccountChecklist } from "./account-checklist";
import { AccountJump } from "./account-jump";
import { SECTIONS, Section } from "./account-section";
import { BusinessDetailsCard } from "./business-details-card";
import { ConnectAssistant } from "./connect-assistant";
import { CurrencyCard } from "./currency-card";
import { DataHub } from "./data-hub";
import { FridayReminderCard } from "./friday-reminder-card";
import { ProfileCard } from "./profile-card";
import { ChangePasswordCard, PasswordNote, SignOutCard } from "./security-cards";

type SectionId = (typeof SECTIONS)[number]["id"];

/** Sections that need the full width on a wide screen. */
const WIDE: Record<SectionId, boolean> = { account: false, invoices: true, data: false, ai: true };

export function AccountView() {
  const me = trpc.account.me.useQuery();
  const emailEnabled = trpc.account.emailEnabled.useQuery();
  const loaded = Boolean(me.data);

  // A link such as /dashboard/account#data (or a quick link) scrolls to its section once the page has drawn it.
  useEffect(() => {
    if (!loaded) return;
    const go = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [loaded]);
  const jump = (id: SectionId) => {
    window.history.replaceState(null, "", `#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (me.isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-xl" />;
  if (me.error || !me.data) {
    return <p className="text-destructive text-sm">Couldn't load your account: {me.error?.message}</p>;
  }
  const account = me.data;

  const blocks: Record<SectionId, React.ReactNode> = {
    account: (
      <Section id="account" title="Profile" description="Your name, your email, and how you sign in.">
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
      <Section id="invoices" title="Invoices" description="The details printed on every invoice you send.">
        <BusinessDetailsCard me={account} />
        <CurrencyCard me={account} />
      </Section>
    ),
    data: (
      <Section
        id="data"
        title="Your data"
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
      <Section id="ai" title="AI assistants" description="Connect an assistant such as Claude or ChatGPT to UseHourly.">
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
      <AccountJump onJump={jump} />

      {/* On a wide screen related sections sit side by side (profile next to your data); the two with wide forms
          (invoices, with its preview, and the assistants) take the whole row. */}
      <div className="grid items-start gap-x-8 gap-y-10 xl:grid-cols-2 xl:items-stretch">
        {SECTIONS.map((s) => (
          <div key={s.id} className={`flex min-w-0 flex-col gap-10 ${WIDE[s.id] ? "xl:col-span-2" : ""}`}>
            {blocks[s.id]}
          </div>
        ))}
      </div>
      <SupportHourly variant="line" />
    </PageShell>
  );
}
