"use client";

import { type ComponentType, useState } from "react";

import { Archive, FileSpreadsheet, HardDrive, Trash2, Upload } from "lucide-react";

import { AccountingExport } from "@/components/accounting-export";
import { DataPanelHead } from "@/components/data-panel-head";
import { DeleteAccountCard } from "@/components/delete-account-card";
import { ExportEverything } from "@/components/export-everything";
import { GuideLink } from "@/components/guide-link";
import { ImportTime } from "@/components/import-time";
import { LocalFirstCard } from "@/components/local-first-card";
import { trpc } from "@/lib/trpc";

import type { AccountMe } from "./account-section";

type Choice = "export" | "accounting" | "import" | "device" | "delete";

type Tile = {
  id: Choice;
  /** The full name (screen readers, tests). */
  label: string;
  /** The short word shown on the tab, so all five fit at half a browser width. */
  short: string;
  icon: ComponentType<{ className?: string }>;
  danger?: boolean;
  /** Sample accounts have no device copy and nothing to delete. */
  realOnly?: boolean;
};

const TILES: Tile[] = [
  { id: "export", label: "Export", short: "Export", icon: Archive },
  { id: "accounting", label: "Accounting app", short: "Accounting", icon: FileSpreadsheet },
  { id: "import", label: "Import history", short: "Import", icon: Upload },
  { id: "device", label: "This device", short: "Device", icon: HardDrive, realOnly: true },
  { id: "delete", label: "Delete account", short: "Delete", icon: Trash2, danger: true, realOnly: true },
];

/**
 * "Your data" as one slim row of choices (what you can do with your data) with the chosen one's settings under it. A
 * count of what is in the account sits on one line above. The first choice is open to begin with.
 */
export function DataHub({ account }: { account: AccountMe }) {
  const tiles = TILES.filter((t) => !t.realOnly || !account.is_demo);
  const [choice, setChoice] = useState<Choice>("export");
  const clients = trpc.clients.list.useQuery();
  const projects = clients.data?.reduce((n, c) => n + c.projects.length, 0);
  return (
    <div className="flex flex-col gap-4">
      {clients.data && (
        <p className="text-foreground/75 text-sm">
          <strong className="text-foreground">{clients.data.length}</strong> clients ·{" "}
          <strong className="text-foreground">{projects}</strong> projects. It is all yours: take it with you any time,
          in files any tool can open.
        </p>
      )}
      <fieldset className="flex min-w-0 gap-4 overflow-x-auto border-0 border-b p-0 sm:gap-6 [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden">
        <legend className="sr-only">What do you want to do with your data?</legend>
        {tiles.map((t) => {
          const on = t.id === choice;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              aria-label={t.label}
              onClick={() => setChoice(t.id)}
              // Standard tabs: plain labels on one line, an underline under the open one. No boxes, no rounded corners.
              className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-0.5 font-semibold text-sm transition-colors ${
                on
                  ? t.danger
                    ? "border-destructive text-destructive"
                    : "border-foreground text-foreground"
                  : t.danger
                    ? "border-transparent text-destructive/70 hover:text-destructive"
                    : "border-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              <Icon className="size-4" aria-hidden />
              {t.short}
            </button>
          );
        })}
      </fieldset>

      <div key={choice}>
        {choice === "export" && (
          <section
            aria-label="Download everything"
            className="grid gap-5 rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 sm:p-6"
          >
            <DataPanelHead icon={Archive} title="Take it all with you.">
              One zip with everything you have ever logged: a workbook with every client and every day,
              {clients.data ? ` ${clients.data.length} sheets, one for each client,` : " a sheet for each client,"} and
              plain CSV files that any tool can open.
            </DataPanelHead>
            <ExportEverything big className="justify-self-start" />
          </section>
        )}
        {choice === "accounting" && (
          <section
            aria-label="Send invoices to your accounting app"
            className="overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
          >
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
        {choice === "import" && <ImportTime />}
        {choice === "device" && !account.is_demo && <LocalFirstCard />}
        {choice === "delete" && !account.is_demo && (
          <DeleteAccountCard hasPassword={account.has_password} email={account.email} />
        )}
      </div>
    </div>
  );
}
