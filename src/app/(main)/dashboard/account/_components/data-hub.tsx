"use client";

import { type ComponentType, useState } from "react";

import { Archive, FileSpreadsheet, HardDrive, Trash2, Upload } from "lucide-react";

import { AccountingExport } from "@/components/accounting-export";
import { DeleteAccountCard } from "@/components/delete-account-card";
import { ExportEverything } from "@/components/export-everything";
import { GuideLink } from "@/components/guide-link";
import { ImportTime } from "@/components/import-time";
import { LocalFirstCard } from "@/components/local-first-card";
import { SectionCard } from "@/components/section-card";

import type { AccountMe } from "./account-section";

type Choice = "export" | "accounting" | "import" | "device" | "delete";

type Tile = {
  id: Choice;
  title: string;
  text: string;
  icon: ComponentType<{ className?: string }>;
  danger?: boolean;
  /** Sample accounts have no device copy and nothing to delete. */
  realOnly?: boolean;
};

const TILES: Tile[] = [
  { id: "export", title: "Export all your data", text: "A zip of spreadsheets", icon: Archive },
  { id: "accounting", title: "Accounting app", text: "Xero or QuickBooks", icon: FileSpreadsheet },
  { id: "import", title: "Import history", text: "Toggl, Clockify, any CSV", icon: Upload },
  { id: "device", title: "This device", text: "Keep a copy for offline", icon: HardDrive, realOnly: true },
  { id: "delete", title: "Delete account", text: "Remove everything", icon: Trash2, danger: true, realOnly: true },
];

/**
 * "Your data" as a small control surface: five icon tiles across the top (what you can do with your data) and the chosen
 * one's settings below, instead of one long page of fields. The first tile is open to begin with.
 */
export function DataHub({ account }: { account: AccountMe }) {
  const tiles = TILES.filter((t) => !t.realOnly || !account.is_demo);
  const [choice, setChoice] = useState<Choice>("export");
  return (
    <div className="flex flex-col gap-4">
      <ul
        aria-label="What do you want to do with your data?"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        {tiles.map((t) => {
          const on = t.id === choice;
          const Icon = t.icon;
          return (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setChoice(t.id)}
                className={`group flex h-full w-full flex-col items-start gap-3 rounded-3xl p-4 text-left outline-none ring-1 transition-all duration-200 focus-visible:ring-4 focus-visible:ring-amber/40 ${
                  on
                    ? `bg-card shadow-[var(--shadow-sheet)] ring-2 ${t.danger ? "ring-destructive/60" : "ring-amber"}`
                    : "bg-card/60 ring-foreground/10 hover:bg-card"
                }`}
              >
                <span
                  className={`grid size-11 place-items-center rounded-2xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 ${
                    t.danger
                      ? "bg-destructive/15 text-destructive"
                      : on
                        ? "bg-amber text-[#1b1405]"
                        : "bg-amber/15 text-foreground"
                  }`}
                >
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block font-display font-extrabold text-base leading-tight">{t.title}</span>
                  <span className="block text-foreground/75 text-sm leading-snug">{t.text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div key={choice}>
        {choice === "export" && (
          <SectionCard
            title="Download everything"
            description="Everything you have logged, every client and all time, as a zip of spreadsheets: one combined workbook, one per client, and plain CSV files."
          >
            <ExportEverything big className="self-start" />
          </SectionCard>
        )}
        {choice === "accounting" && (
          <SectionCard
            title={
              <span className="inline-flex items-center gap-1">
                Send invoices to your accounting app <GuideLink topic="xero-quickbooks" label="Xero and QuickBooks" />
              </span>
            }
            description="Your invoices as a file Xero or QuickBooks Online can import, or a list of payments received. Days you marked non-billable are already left off every invoice."
          >
            <AccountingExport />
          </SectionCard>
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
