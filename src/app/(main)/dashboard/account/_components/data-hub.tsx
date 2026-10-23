"use client";

import { Archive, FileSpreadsheet } from "lucide-react";

import { AccountingExport } from "@/components/accounting-export";
import { DataPanelHead } from "@/components/data-panel-head";
import { ExportEverything } from "@/components/export-everything";
import { GuideLink } from "@/components/guide-link";
import { ImportTime } from "@/components/import-time";
import { LocalFirstCard } from "@/components/local-first-card";
import { feature } from "@/lib/features";
import { count, word } from "@/lib/plural";
import { trpc } from "@/lib/trpc";

import type { AccountMe } from "./account-section";

const CARD = "rounded-3xl bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10";

/**
 * "Your data" is ONE page: the things you can do with your data as plain sections one under the other (export, and, when
 * those features are on, send to an accounting app, import, keep a copy on this device) (Delete account lives under Profile). No tabs inside the tab: everything
 * is where you scroll to. Sample accounts have no device copy and nothing to delete.
 */
export function DataHub({ account }: { account: AccountMe }) {
  const clients = trpc.clients.list.useQuery();
  const projects = clients.data?.reduce((n, c) => n + c.projects.length, 0);
  return (
    <div className="flex flex-col gap-5">
      {clients.data && (
        <p className="text-foreground/75 text-sm">
          <strong className="text-foreground">{clients.data.length}</strong> {word(clients.data.length, "client")} ·{" "}
          <strong className="text-foreground">{projects}</strong> {word(projects ?? 0, "project")}. It is all yours:
          take it with you any time, in files any tool can open.
        </p>
      )}

      <section aria-label="Download everything" className={`grid content-start gap-4 p-5 sm:p-6 ${CARD}`}>
        <DataPanelHead icon={Archive} title="Download everything">
          One zip with everything you have ever logged: a workbook with every client and every day,
          {clients.data ? ` ${count(clients.data.length, "sheet")}, one for each client,` : " a sheet for each client,"}{" "}
          and plain CSV files that any tool can open.
        </DataPanelHead>
        <ExportEverything big className="justify-self-start" />
      </section>

      {feature("accountingExport") && (
        <section aria-label="Send invoices to your accounting app" className={`overflow-hidden ${CARD}`}>
          <div className="p-5 pb-4 sm:p-6 sm:pb-5">
            <DataPanelHead
              icon={FileSpreadsheet}
              title="Send your invoices to the books."
              aside={<GuideLink topic="xero-quickbooks" label="Xero and QuickBooks" />}
            >
              Your invoices as a file Xero or QuickBooks Online can import, or a list of payments received. Days you
              marked non-billable are already left off every invoice.
            </DataPanelHead>
          </div>
          <AccountingExport />
        </section>
      )}

      {feature("importTime") && <ImportTime />}
      {feature("localFirst") && !account.is_demo && <LocalFirstCard />}
    </div>
  );
}
