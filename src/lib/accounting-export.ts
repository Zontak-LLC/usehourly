import { toCsv } from "@/lib/export-all";

/**
 * Invoices as files an accounting app can import: Xero's sales-invoice template, QuickBooks Online's invoice import,
 * and a plain list of payments received. Built in the browser from invoices the signed-in user already owns, so nothing
 * is sent anywhere. Each invoice line is one row (a repeated invoice number groups the rows into one invoice).
 *
 * Quantity is hours and unit amount is the hourly rate, so quantity x unit amount is the line total. The line total is
 * rounded to the cent once, on the invoice, and these files carry that same figure where the app asks for an amount.
 */
export type AccountingInvoice = {
  number: string;
  issueDate: string;
  dueDate: string | null;
  paidDate: string | null;
  periodFrom: string;
  periodTo: string;
  totalCents: number;
  notes: string;
  client: { name: string; legalName: string | null; address: string | null; email: string | null };
  lines: { project: string; minutes: number; rateCents: number; amountCents: number }[];
};

export type DateStyle = "us" | "eu" | "iso";
export const DATE_STYLES: { value: DateStyle; label: string }[] = [
  { value: "us", label: "MM/DD/YYYY" },
  { value: "eu", label: "DD/MM/YYYY" },
  { value: "iso", label: "YYYY-MM-DD" },
];

export type AccountingOptions = {
  dateStyle: DateStyle;
  /** Xero: the sales account the income goes to ("200" is Xero's default Sales account). */
  accountCode: string;
  /** Xero: the tax rate name for every line, as the organisation spells it ("Tax Exempt", "No VAT", ...). */
  taxType: string;
  /** QuickBooks: the product or service every line is billed as; it must already exist in QuickBooks. */
  itemName: string;
};

export const DEFAULT_ACCOUNTING_OPTIONS: AccountingOptions = {
  dateStyle: "us",
  accountCode: "200",
  taxType: "Tax Exempt",
  itemName: "Services",
};

/** The options with blanks replaced by the defaults and stray whitespace and line breaks removed. */
export function cleanOptions(o: Partial<AccountingOptions>): AccountingOptions {
  const clean = (v: string | undefined, fallback: string) =>
    (v ?? "")
      .replace(/[\r\n\t]+/g, " ")
      .trim()
      .slice(0, 80) || fallback;
  return {
    dateStyle: o.dateStyle ?? DEFAULT_ACCOUNTING_OPTIONS.dateStyle,
    accountCode: clean(o.accountCode, DEFAULT_ACCOUNTING_OPTIONS.accountCode),
    taxType: clean(o.taxType, DEFAULT_ACCOUNTING_OPTIONS.taxType),
    itemName: clean(o.itemName, DEFAULT_ACCOUNTING_OPTIONS.itemName),
  };
}

/** "2026-10-31" as 10/31/2026, 31/10/2026 or left alone. */
export function formatDate(iso: string, style: DateStyle): string {
  const [y, m, d] = iso.split("-");
  if (style === "us") return `${m}/${d}/${y}`;
  if (style === "eu") return `${d}/${m}/${y}`;
  return iso;
}

const hours = (minutes: number) => (minutes / 60).toFixed(4);
const dollars = (cents: number) => (cents / 100).toFixed(2);
const customer = (i: AccountingInvoice) => i.client.legalName || i.client.name;
const period = (i: AccountingInvoice, style: DateStyle) =>
  `${formatDate(i.periodFrom, style)} to ${formatDate(i.periodTo, style)}`;
const description = (project: string, i: AccountingInvoice, style: DateStyle) => `${project}, ${period(i, style)}`;

const XERO_HEADERS = [
  "*ContactName",
  "EmailAddress",
  "POAddressLine1",
  "POAddressLine2",
  "POAddressLine3",
  "POAddressLine4",
  "POCity",
  "PORegion",
  "POPostalCode",
  "POCountry",
  "*InvoiceNumber",
  "Reference",
  "*InvoiceDate",
  "*DueDate",
  "InventoryItemCode",
  "*Description",
  "*Quantity",
  "*UnitAmount",
  "Discount",
  "*AccountCode",
  "*TaxType",
  "TrackingName1",
  "TrackingOption1",
  "TrackingName2",
  "TrackingOption2",
  "Currency",
  "BrandingTheme",
] as const;

/** Xero's "sales invoice" import template (they arrive in Xero as drafts to approve). */
export function xeroInvoicesCsv(invoices: AccountingInvoice[], options: Partial<AccountingOptions> = {}): string {
  const o = cleanOptions(options);
  const rows: (string | number)[][] = [[...XERO_HEADERS]];
  for (const i of invoices) {
    const address = (i.client.address ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of i.lines) {
      rows.push([
        customer(i),
        i.client.email ?? "",
        address[0] ?? "",
        address[1] ?? "",
        address[2] ?? "",
        address.slice(3).join(", "),
        "",
        "",
        "",
        "",
        i.number,
        `Time ${period(i, o.dateStyle)}`,
        formatDate(i.issueDate, o.dateStyle),
        formatDate(i.dueDate ?? i.issueDate, o.dateStyle),
        "",
        description(line.project, i, o.dateStyle),
        hours(line.minutes),
        dollars(line.rateCents),
        "",
        o.accountCode,
        o.taxType,
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    }
  }
  return toCsv(rows);
}

/** QuickBooks Online's invoice import (its mapping step lets the columns be matched by name). */
export function quickbooksInvoicesCsv(invoices: AccountingInvoice[], options: Partial<AccountingOptions> = {}): string {
  const o = cleanOptions(options);
  const rows: (string | number)[][] = [
    [
      "InvoiceNo",
      "Customer",
      "InvoiceDate",
      "DueDate",
      "Terms",
      "Location",
      "Memo",
      "Item(Product/Service)",
      "ItemDescription",
      "ItemQuantity",
      "ItemRate",
      "ItemAmount",
      "Service Date",
    ],
  ];
  for (const i of invoices) {
    for (const line of i.lines) {
      rows.push([
        i.number,
        customer(i),
        formatDate(i.issueDate, o.dateStyle),
        formatDate(i.dueDate ?? i.issueDate, o.dateStyle),
        "",
        "",
        i.notes,
        o.itemName,
        description(line.project, i, o.dateStyle),
        hours(line.minutes),
        dollars(line.rateCents),
        dollars(line.amountCents),
        formatDate(i.periodTo, o.dateStyle),
      ]);
    }
  }
  return toCsv(rows);
}

/** The invoices that have been paid, with when and how much: for recording payments in any accounting app. */
export function paymentsCsv(invoices: AccountingInvoice[], options: Partial<AccountingOptions> = {}): string {
  const o = cleanOptions(options);
  const rows: (string | number)[][] = [["InvoiceNumber", "Customer", "PaymentDate", "Amount"]];
  for (const i of invoices) {
    if (!i.paidDate) continue;
    rows.push([i.number, customer(i), formatDate(i.paidDate, o.dateStyle), dollars(i.totalCents)]);
  }
  return toCsv(rows);
}

export type AccountingKind = "xero" | "quickbooks" | "payments";

export const ACCOUNTING_KINDS: { kind: AccountingKind; label: string; hint: string }[] = [
  {
    kind: "xero",
    label: "Xero invoices",
    hint: "Import under Business > Invoices > Import. They arrive as drafts to approve.",
  },
  {
    kind: "quickbooks",
    label: "QuickBooks Online invoices",
    hint: "Import under Settings > Import data > Invoices. Match the columns when asked; customers and the item must exist or be added.",
  },
  {
    kind: "payments",
    label: "Payments received",
    hint: "A plain list of paid invoices, to record payments in any accounting app.",
  },
];

export function buildAccountingCsv(
  kind: AccountingKind,
  invoices: AccountingInvoice[],
  options: Partial<AccountingOptions> = {},
): string {
  if (kind === "xero") return xeroInvoicesCsv(invoices, options);
  if (kind === "quickbooks") return quickbooksInvoicesCsv(invoices, options);
  return paymentsCsv(invoices, options);
}

export function accountingFileName(kind: AccountingKind, from: string, to: string): string {
  const span =
    from.slice(0, 4) === to.slice(0, 4) && from.endsWith("-01-01") && to.endsWith("-12-31")
      ? from.slice(0, 4)
      : `${from}_to_${to}`;
  return `usehourly-${kind}-${span}.csv`;
}

/** Browser-only: save text as a .csv file. */
export function downloadCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
