"use client";

import type { ReactNode } from "react";

import { Database, FileText, Heart, Sparkles, UserRound } from "lucide-react";

import { SplitRow, SplitView } from "@/components/split-view";
import { pushLocationHash } from "@/components/use-location-hash";
import { ACCOUNT_SECTIONS, type AccountFacts, type AccountSectionId, accountStatusLines } from "@/lib/account-sections";
import { donateUrl } from "@/lib/donate";

const ICONS = { account: UserRound, invoices: FileText, data: Database, ai: Sparkles } as const;

function Tile({ icon: Icon, quiet = false }: { icon: typeof Heart; quiet?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-10 shrink-0 place-items-center rounded-xl bg-card ring-1 ring-foreground/10 ${quiet ? "opacity-60" : ""}`}
    >
      <Icon className="size-5" />
    </span>
  );
}

/**
 * The Account split view (issue 283): the sections as rows on the left, each a real link to its #address with one
 * status line, and Support as a quiet last row that leaves for the donation page. The chosen section is `children`.
 */
export function AccountSectionList({
  open,
  me,
  clients,
  tokens,
  children,
}: {
  open: AccountSectionId | null;
  me: AccountFacts;
  clients: { projects: unknown[] }[] | undefined;
  tokens: { state: string }[] | undefined;
  children: ReactNode;
}) {
  const lines = accountStatusLines(me, clients, tokens);
  const selected = open ?? "account"; // a wide screen with no #part shows Your account
  const donate = donateUrl();
  return (
    <SplitView
      view={open ? "detail" : "list"}
      headerless="the split view: the Account sections and the chosen one, which has its own heading"
      back={{ href: "/dashboard/account", label: "Account", onBack: () => pushLocationHash(null) }}
      detailClassName="p-3 sm:p-5"
      list={
        <nav aria-label="Account sections" className="flex flex-col gap-0.5 p-2">
          {ACCOUNT_SECTIONS.map((s) => (
            <SplitRow
              key={s.id}
              href={`#${s.id}`}
              selected={s.id === selected}
              onOpen={() => pushLocationHash(s.id)}
              leading={<Tile icon={ICONS[s.id]} />}
              title={s.label}
              line={lines[s.id]}
            />
          ))}
          {donate && (
            <SplitRow
              href={donate}
              external
              selected={false}
              quiet
              leading={<Tile icon={Heart} quiet />}
              title="Support UseHourly"
              line="Free · chip in if you like"
            />
          )}
        </nav>
      }
    >
      {children}
    </SplitView>
  );
}
