/**
 * Money. The whole app stores amounts as integer minor units ("cents"), so only currencies with two decimals are
 * offered; zero-decimal ones (yen, won) wait until the app stores the exponent too. One currency per account (issue
 * #71 step 1); it only changes how an amount is written, never the number: nothing here converts between currencies.
 */
export const DEFAULT_CURRENCY = "USD";

/** The two-decimal currencies on offer, with the name shown in the picker. */
export const CURRENCIES = [
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British pound" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "AUD", name: "Australian dollar" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "CHF", name: "Swiss franc" },
  { code: "SEK", name: "Swedish krona" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "DKK", name: "Danish krone" },
  { code: "PLN", name: "Polish zloty" },
  { code: "CZK", name: "Czech koruna" },
  { code: "MXN", name: "Mexican peso" },
  { code: "BRL", name: "Brazilian real" },
  { code: "INR", name: "Indian rupee" },
  { code: "ZAR", name: "South African rand" },
  { code: "SGD", name: "Singapore dollar" },
  { code: "HKD", name: "Hong Kong dollar" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [CurrencyCode, ...CurrencyCode[]];

export const isCurrency = (value: unknown): value is CurrencyCode =>
  typeof value === "string" && CURRENCIES.some((c) => c.code === value);

/** A stored or received value as a supported currency; anything else (an old row, a bad value) is the default. */
export const currencyOrDefault = (value: unknown): CurrencyCode => (isCurrency(value) ? value : DEFAULT_CURRENCY);

/** The currency a client is billed in: its own when it has one, else the account's (issue #71 step 2). */
export const effectiveCurrency = (clientCurrency: unknown, accountCurrency: unknown): CurrencyCode =>
  isCurrency(clientCurrency) ? clientCurrency : currencyOrDefault(accountCurrency);

/** "$1,234.50", "€1,234.50", "CHF 1,234.50": always the en-US pattern, so server and browser write it the same way. */
export const formatMoney = (cents: number, currency: string = DEFAULT_CURRENCY) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currencyOrDefault(currency) }).format(cents / 100);

/** The symbol or short code a person types next to an amount: "$", "€", "CHF". */
export const currencySymbol = (currency: string = DEFAULT_CURRENCY) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currencyOrDefault(currency) })
    .formatToParts(0)
    .find((p) => p.type === "currency")?.value ?? DEFAULT_CURRENCY;

/** The Excel number format for an amount in this currency, e.g. `"$"#,##0.00` (quoted so any symbol is literal). */
export const excelMoneyFormat = (currency: string = DEFAULT_CURRENCY) =>
  `"${currencySymbol(currency).replace(/"/g, "")}"#,##0.00`;

/**
 * The same amount for the PDF, whose built-in font only has Latin-1 characters: "$150.00" and "£150.00" are fine, but a
 * symbol such as "€" or "₹" would vanish or break the line, so those amounts carry the code instead ("EUR 150.00").
 */
export const formatMoneyForPdf = (cents: number, currency: string = DEFAULT_CURRENCY) => {
  const symbolic = formatMoney(cents, currency);
  if (/^[\u0020-\u00ff]*$/.test(symbolic)) return symbolic;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyOrDefault(currency),
    currencyDisplay: "code",
  }).format(cents / 100);
};

export type CurrencyTotals = { currency: CurrencyCode; count: number; total: number; unpaid: number };

/**
 * Invoice totals per currency, in the order each currency first appears. Amounts in different currencies are never
 * added together (nothing converts between them), so a list that mixes two shows two sets of figures.
 */
export function totalsByCurrency(
  invoices: { currency: string; total_cents: number; paid_date: string | null }[],
): CurrencyTotals[] {
  const groups = new Map<CurrencyCode, CurrencyTotals>();
  for (const i of invoices) {
    const currency = currencyOrDefault(i.currency);
    const g = groups.get(currency) ?? { currency, count: 0, total: 0, unpaid: 0 };
    g.count += 1;
    g.total += i.total_cents;
    if (!i.paid_date) g.unpaid += i.total_cents;
    groups.set(currency, g);
  }
  return [...groups.values()];
}
