/**
 * Tax on invoices (issue #71 step 4): one tax per account (VAT, GST, sales tax), added on top of an invoice's lines.
 * Rates are whole basis points (hundredths of a percent: 2000 = 20%, 825 = 8.25%) so the maths stays in integers, like
 * money (integer cents). The tax is worked out once on the whole subtotal and rounded to the nearest cent.
 */

/** Names offered as one-tap suggestions; any short name can be typed. */
export const TAX_NAMES = ["VAT", "GST", "HST", "Sales tax"] as const;

export const MAX_TAX_NAME = 30;
export const MAX_TAX_NUMBER = 40;
/** 100% in basis points: no tax is higher. */
export const MAX_TAX_RATE = 10_000;

/** The tax an account adds, as stored. A rate of 0 or null means none is added. */
export type TaxSetting = { name: string | null; rate: number | null; number: string | null };

/** The tax frozen into an invoice. */
export type InvoiceTax = { name: string; rate: number; cents: number };

/** "20" "7.5" "8,25" "20 %" as basis points, or an error to show. Empty = no tax (0). */
export function parseTaxRate(text: string): { rate: number } | { error: string } {
  const t = text.trim().replace(/\s*%$/, "").replace(",", ".");
  if (t === "") return { rate: 0 };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return { error: "Type the rate as a percentage, e.g. 20 or 7.5." };
  const rate = Math.round(Number(t) * 100);
  if (rate > MAX_TAX_RATE) return { error: "A tax rate can be at most 100%." };
  return { rate };
}

/** 2000 → "20%", 750 → "7.5%", 825 → "8.25%". */
export function formatTaxRate(rate: number): string {
  return `${Number((rate / 100).toFixed(2))}%`;
}

/** The rate as typed in the box: 2000 → "20", 0/null → "". */
export const taxRateInput = (rate: number | null | undefined) => (rate ? String(Number((rate / 100).toFixed(2))) : "");

/** Tax on a subtotal, rounded once to the nearest cent. */
export function taxCents(subtotalCents: number, rate: number): number {
  return Math.round((subtotalCents * rate) / MAX_TAX_RATE);
}

/** The tax to add to an invoice with this subtotal, or null when the account adds none. */
export function invoiceTax(
  subtotalCents: number,
  setting: Pick<TaxSetting, "name" | "rate"> | null,
): InvoiceTax | null {
  if (!setting?.rate || setting.rate <= 0) return null;
  return { name: taxLabel(setting.name), rate: setting.rate, cents: taxCents(subtotalCents, setting.rate) };
}

/** The tax's printed name: what the person typed, else plain "Tax". */
export const taxLabel = (name: string | null | undefined) => name?.trim() || "Tax";

/** "VAT (20%)": the label of the tax row on an invoice. */
export const taxRowLabel = (t: { name: string; rate: number }) => `${t.name} (${formatTaxRate(t.rate)})`;

/** The seller's tax number as printed: "VAT number GB123456789". */
export const taxNumberLine = (t: { label: string; value: string }) => `${t.label} ${t.value}`;

/** The label printed before a tax number: "VAT number", or "Tax number" when no tax is named. */
export const taxNumberLabel = (name: string | null | undefined) => `${taxLabel(name)} number`;
