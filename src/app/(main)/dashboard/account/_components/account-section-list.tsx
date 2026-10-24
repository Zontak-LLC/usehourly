"use client";

import type { ReactNode } from "react";

import { Database, FileText, Heart, Sparkles, UserRound } from "lucide-react";

import { SectionSplit, SplitRow, SplitTile } from "@/components/split-view";
import { ACCOUNT_SECTIONS, type AccountFacts, type AccountSectionId, accountStatusLines } from "@/lib/account-sections";
import { donateUrl } from "@/lib/donate";

const ICONS = { account: UserRound, invoices: FileText, data: Database, ai: Sparkles } as const;

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
  const donate = donateUrl();
  return (
    <SectionSplit
      label="Account sections"
      sections={ACCOUNT_SECTIONS.map((s) => ({ ...s, line: lines[s.id], icon: ICONS[s.id] }))}
      open={open}
      fallback="account" // a wide screen with no #part shows Your account
      headerless="the split view: the Account sections and the chosen one, which has its own heading"
      back={{ href: "/dashboard/account", label: "Account" }}
      detailClassName="px-1 py-3 sm:p-5"
      after={
        donate && (
          <SplitRow
            href={donate}
            external
            selected={false}
            quiet
            leading={<SplitTile icon={Heart} quiet />}
            title="Support UseHourly"
            line="Free · chip in if you like"
          />
        )
      }
    >
      {children}
    </SectionSplit>
  );
}
