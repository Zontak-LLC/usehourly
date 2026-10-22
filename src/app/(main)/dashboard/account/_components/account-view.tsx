"use client";

import { useEffect, useState } from "react";

import { AiPolishCard } from "@/components/ai-polish-card";
import { ApiTokensCard } from "@/components/api-tokens-card";
import { ClaimDemoCard } from "@/components/claim-demo-card";
import { PageShell } from "@/components/page-shell";
import { SectionCard } from "@/components/section-card";
import { SupportHourly } from "@/components/support-hourly";
import { Skeleton } from "@/components/ui/skeleton";
import { useReorderAnimation } from "@/components/use-reorder-animation";
import { type AccountSectionId, rankSections } from "@/lib/account-search";
import { trpc } from "@/lib/trpc";

import { AccountChecklist } from "./account-checklist";
import { AccountSearch } from "./account-search";
import { Section } from "./account-section";
import { BusinessDetailsCard } from "./business-details-card";
import { ConnectAssistant } from "./connect-assistant";
import { CurrencyCard } from "./currency-card";
import { DataHub } from "./data-hub";
import { FridayReminderCard } from "./friday-reminder-card";
import { ProfileCard } from "./profile-card";
import { ChangePasswordCard, PasswordNote, SignOutCard } from "./security-cards";

/** Sections that need the full width on a wide screen. */
const WIDE: Record<AccountSectionId, boolean> = { account: false, invoices: true, data: false, ai: true };

export function AccountView() {
  const [query, setQuery] = useState("");
  const order = rankSections(query);
  const me = trpc.account.me.useQuery();
  const emailEnabled = trpc.account.emailEnabled.useQuery();
  const loaded = Boolean(me.data);
  // The sections only exist once the account has loaded, so that counts as a change too (it records where they are).
  const slideRef = useReorderAnimation(`${loaded}:${order.map((s) => s.id).join()}`);

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
  const jump = (id: AccountSectionId) => {
    window.history.replaceState(null, "", `#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (me.isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-xl" />;
  if (me.error || !me.data) {
    return <p className="text-destructive text-sm">Couldn't load your account: {me.error?.message}</p>;
  }
  const account = me.data;

  const blocks: Record<AccountSectionId, React.ReactNode> = {
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
                <FridayReminderCard me={account} emailEnabled={emailEnabled.data} />
                {account.has_password ? <ChangePasswordCard me={account} /> : <PasswordNote />}
                <SignOutCard />
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
        description="Keep a copy of everything you have logged, or bring your history in from another tool."
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
            <AiPolishCard />
          </>
        )}
      </Section>
    ),
  };
  const typing = query.trim() !== "";
  const matchCount = order.filter((s) => s.matches).length;

  return (
    <PageShell nav="account" title="Account" description="Your details, invoices, data and connections.">
      <AccountSearch query={query} onQuery={setQuery} onJump={jump} />

      {/* On a wide screen related sections sit side by side (your account next to your data); the two with wide forms
          (invoices, with its preview, and the assistants) take the whole row. Matches come first, so the best match is
          always top left. */}
      <div className="grid items-start gap-x-8 gap-y-10 xl:grid-cols-2">
        {order.map((s, i) => (
          <div
            key={s.id}
            ref={slideRef(s.id)}
            className={`flex min-w-0 flex-col gap-10 ${WIDE[s.id] ? "xl:col-span-2" : ""}`}
          >
            {/* A quiet divider where the matches stop and the rest of the settings begin. */}
            {typing && i === matchCount && matchCount > 0 && (
              <p className="border-t pt-4 font-mono text-[11px] text-foreground/70 uppercase tracking-widest">
                Everything else
              </p>
            )}
            {blocks[s.id]}
          </div>
        ))}
      </div>
      <SupportHourly variant="line" />
    </PageShell>
  );
}
