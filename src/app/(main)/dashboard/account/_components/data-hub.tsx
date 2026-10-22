"use client";

import { type ComponentType, useState } from "react";

import { Archive, FileSpreadsheet, HardDrive, Trash2, Upload } from "lucide-react";

import { AccountingExport } from "@/components/accounting-export";
import { AccountingScene } from "@/components/accounting-scene";
import { DeleteAccountCard } from "@/components/delete-account-card";
import { ExportEverything } from "@/components/export-everything";
import { ExportScene } from "@/components/export-scene";
import { GuideLink } from "@/components/guide-link";
import { ImportTime } from "@/components/import-time";
import { LocalFirstCard } from "@/components/local-first-card";
import { trpc } from "@/lib/trpc";

import type { AccountMe } from "./account-section";

type Choice = "export" | "accounting" | "import" | "device" | "delete";

type Tile = {
  id: Choice;
  label: string;
  icon: ComponentType<{ className?: string }>;
  danger?: boolean;
  /** Sample accounts have no device copy and nothing to delete. */
  realOnly?: boolean;
};

const TILES: Tile[] = [
  { id: "export", label: "Export", icon: Archive },
  { id: "accounting", label: "Accounting app", icon: FileSpreadsheet },
  { id: "import", label: "Import history", icon: Upload },
  { id: "device", label: "This device", icon: HardDrive, realOnly: true },
  { id: "delete", label: "Delete account", icon: Trash2, danger: true, realOnly: true },
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
      <fieldset className="-m-1 flex min-w-0 gap-2 overflow-x-auto border-0 p-1 [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden">
        <legend className="sr-only">What do you want to do with your data?</legend>
        {tiles.map((t) => {
          const on = t.id === choice;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => setChoice(t.id)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 font-semibold text-sm ring-1 transition-colors ${
                on
                  ? t.danger
                    ? "bg-destructive text-white ring-transparent"
                    : "bg-foreground text-background ring-transparent"
                  : t.danger
                    ? "text-destructive ring-destructive/40 hover:bg-destructive/10"
                    : "ring-foreground/15 hover:bg-muted"
              }`}
            >
              <Icon className="size-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </fieldset>

      <div key={choice}>
        {choice === "export" && (
          <section
            aria-label="Download everything"
            className="grid items-center gap-5 rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 sm:grid-cols-[auto_1fr] sm:gap-8 sm:p-6"
          >
            <ExportScene className="mx-auto w-44 sm:w-56" />
            <div className="grid gap-3">
              <h3 className="font-bold font-display text-2xl leading-tight">Take it all with you.</h3>
              <p className="max-w-xl text-foreground/75">
                One zip with everything you have ever logged: a workbook with every client and every day,
                {clients.data ? ` ${clients.data.length} sheets, one for each client,` : " a sheet for each client,"}{" "}
                and plain CSV files that any tool can open.
              </p>
              <ExportEverything big className="justify-self-start" />
            </div>
          </section>
        )}
        {choice === "accounting" && (
          <section
            aria-label="Send invoices to your accounting app"
            className="grid gap-5 rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 sm:p-6"
          >
            <div className="grid items-center gap-5 sm:grid-cols-[auto_1fr] sm:gap-8">
              <AccountingScene className="mx-auto w-44 sm:w-56" />
              <div className="grid gap-3">
                <h3 className="inline-flex items-center gap-2 font-bold font-display text-2xl leading-tight">
                  Send your invoices to the books.
                  <GuideLink topic="xero-quickbooks" label="Xero and QuickBooks" />
                </h3>
                <p className="max-w-xl text-foreground/75">
                  Your invoices as a file Xero or QuickBooks Online can import, or a list of payments received. Days you
                  marked non-billable are already left off every invoice.
                </p>
              </div>
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
