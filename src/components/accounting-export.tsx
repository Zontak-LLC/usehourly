"use client";

import { useState } from "react";

import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACCOUNTING_KINDS,
  type AccountingKind,
  accountingFileName,
  buildAccountingCsv,
  DATE_STYLES,
  type DateStyle,
  DEFAULT_ACCOUNTING_OPTIONS,
  downloadCsv,
} from "@/lib/accounting-export";
import { trpc } from "@/lib/trpc";
import { useToday } from "@/lib/use-today";

const selectClass = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm dark:bg-input/30";

/**
 * Invoices as a file Xero or QuickBooks Online can import, or a list of payments received: pick a year, a format and
 * the few settings that format needs, and download. Built in the browser from the invoices the account already owns.
 */
export function AccountingExport() {
  const utils = trpc.useUtils();
  const today = useToday();
  const thisYear = today ? Number(today.slice(0, 4)) : new Date().getFullYear();
  const [kind, setKind] = useState<AccountingKind>("xero");
  const [year, setYear] = useState<string>("this");
  const [dateStyle, setDateStyle] = useState<DateStyle>(DEFAULT_ACCOUNTING_OPTIONS.dateStyle);
  const [accountCode, setAccountCode] = useState(DEFAULT_ACCOUNTING_OPTIONS.accountCode);
  const [taxType, setTaxType] = useState(DEFAULT_ACCOUNTING_OPTIONS.taxType);
  const [itemName, setItemName] = useState(DEFAULT_ACCOUNTING_OPTIONS.itemName);
  const [busy, setBusy] = useState(false);
  // Files carry plain numbers, so when invoices exist in several currencies one is chosen for the file.
  const currencies = trpc.accounting.currencies.useQuery().data ?? [];
  const [currency, setCurrency] = useState("");
  const chosenCurrency = currencies.length > 1 ? (currencies.find((c) => c === currency) ?? currencies[0]) : undefined;
  const picked = ACCOUNTING_KINDS.find((k) => k.kind === kind) ?? ACCOUNTING_KINDS[0];

  const years = [thisYear, thisYear - 1, thisYear - 2];
  const range = () => {
    if (year === "all") return { from: "2000-01-01", to: "2100-12-31" };
    const y = year === "this" ? thisYear : Number(year);
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  };

  async function run() {
    setBusy(true);
    try {
      const { from, to } = range();
      const { invoices, more } = await utils.accounting.invoices.fetch({ from, to, currency: chosenCurrency });
      if (invoices.length === 0) {
        toast.info("No invoices were issued in that period, so there is nothing to export.");
        return;
      }
      const csv = buildAccountingCsv(kind, invoices, { dateStyle, accountCode, taxType, itemName });
      downloadCsv(accountingFileName(kind, from, to), csv);
      toast.success(`Downloaded ${invoices.length} ${invoices.length === 1 ? "invoice" : "invoices"}.`);
      if (more) toast.warning("Only the first 200 invoices are in this file. Choose a shorter period for the rest.");
    } catch (err) {
      toast.error(err instanceof Error ? `Export failed: ${err.message}` : "Export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="acct-format">Send to</Label>
          <select
            id="acct-format"
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as AccountingKind)}
          >
            {ACCOUNTING_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="acct-year">Invoices issued in</Label>
          <select id="acct-year" className={selectClass} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="this">{thisYear}</option>
            {years.slice(1).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
            <option value="all">All time</option>
          </select>
        </div>
        {chosenCurrency && (
          <div className="grid gap-1.5">
            <Label htmlFor="acct-currency">Currency</Label>
            <select
              id="acct-currency"
              className={selectClass}
              value={chosenCurrency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="acct-dates">Date format</Label>
          <select
            id="acct-dates"
            className={selectClass}
            value={dateStyle}
            onChange={(e) => setDateStyle(e.target.value as DateStyle)}
          >
            {DATE_STYLES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        {kind === "xero" && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="acct-code">Sales account code</Label>
              <Input id="acct-code" value={accountCode} onChange={(e) => setAccountCode(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="acct-tax">Tax type</Label>
              <Input id="acct-tax" value={taxType} onChange={(e) => setTaxType(e.target.value)} />
            </div>
          </>
        )}
        {kind === "quickbooks" && (
          <div className="grid gap-1.5">
            <Label htmlFor="acct-item">Product or service name</Label>
            <Input id="acct-item" value={itemName} onChange={(e) => setItemName(e.target.value)} />
          </div>
        )}
      </div>
      <p className="text-muted-foreground text-sm">{picked.hint}</p>
      <Button variant="outline" className="h-10 self-start" onClick={run} disabled={busy}>
        <Download /> {busy ? "Preparing…" : "Download CSV"}
      </Button>
    </div>
  );
}
