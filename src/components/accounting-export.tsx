"use client";

import { useState } from "react";

import { Download } from "lucide-react";
import { toast } from "sonner";

import { DocButton } from "@/components/doc-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
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

  const select = (id: string, label: string, control: React.ReactNode) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
    </div>
  );
  return (
    <>
      <div className="grid gap-5 px-5 pb-5 sm:px-6">
        <fieldset className="grid gap-3 border-0 p-0">
          <legend className="mb-3 font-mono text-[11px] text-foreground/75 uppercase tracking-widest">
            What to send
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {select(
              "acct-format",
              "Send to",
              <NativeSelect id="acct-format" value={kind} onChange={(e) => setKind(e.target.value as AccountingKind)}>
                {ACCOUNTING_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </NativeSelect>,
            )}
            {select(
              "acct-year",
              "Invoices issued in",
              <NativeSelect id="acct-year" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="this">{thisYear}</option>
                {years.slice(1).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
                <option value="all">All time</option>
              </NativeSelect>,
            )}
            {chosenCurrency &&
              select(
                "acct-currency",
                "Currency",
                <NativeSelect id="acct-currency" value={chosenCurrency} onChange={(e) => setCurrency(e.target.value)}>
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>,
              )}
          </div>
        </fieldset>
        <fieldset className="grid gap-3 border-0 p-0">
          <legend className="mb-3 font-mono text-[11px] text-foreground/75 uppercase tracking-widest">
            How it is written
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {select(
              "acct-dates",
              "Date format",
              <NativeSelect
                id="acct-dates"
                value={dateStyle}
                onChange={(e) => setDateStyle(e.target.value as DateStyle)}
              >
                {DATE_STYLES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </NativeSelect>,
            )}
            {kind === "xero" && (
              <>
                {select(
                  "acct-code",
                  "Sales account code",
                  <Input id="acct-code" value={accountCode} onChange={(e) => setAccountCode(e.target.value)} />,
                )}
                {select(
                  "acct-tax",
                  "Tax type",
                  <Input id="acct-tax" value={taxType} onChange={(e) => setTaxType(e.target.value)} />,
                )}
              </>
            )}
            {kind === "quickbooks" &&
              select(
                "acct-item",
                "Product or service name",
                <Input id="acct-item" value={itemName} onChange={(e) => setItemName(e.target.value)} />,
              )}
          </div>
        </fieldset>
      </div>
      {/* The foot of the card: what happens next on the left, the one action on the right, on a tinted strip. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 mt-auto border-t bg-band-2 px-5 py-4 sm:px-6">
        <p className="min-w-0 flex-1 basis-64 text-foreground/75 text-sm">{picked.hint}</p>
        <DocButton
          onClick={run}
          disabled={busy}
          busy={busy}
          icon={<Download />}
          title={busy ? "Preparing…" : "Download CSV"}
          hint="Ready to import"
          label={busy ? "Preparing…" : "Download CSV"}
        />
      </div>
    </>
  );
}
