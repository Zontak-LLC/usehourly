/**
 * Expenses and mileage (issue 100, first slice): what a freelancer spent, for the year summary at tax time. Pure rules
 * shared by the server (validation) and the screens (the form and the totals). Money is integer cents in the account's
 * currency; a mileage row stores its distance in tenths (12.3 mi = 123) and its rate in tenths of a cent per mile or
 * kilometre (70.0 cents = 700), and its amount is worked out from those two, never typed.
 */

export const EXPENSE_CATEGORIES = [
  { id: "software", label: "Software and subscriptions" },
  { id: "equipment", label: "Equipment" },
  { id: "office", label: "Office and supplies" },
  { id: "phone", label: "Phone and internet" },
  { id: "travel", label: "Travel" },
  { id: "meals", label: "Meals" },
  { id: "fees", label: "Fees and services" },
  { id: "education", label: "Courses and books" },
  { id: "other", label: "Other" },
  { id: "mileage", label: "Mileage" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["id"];
export const CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id) as [ExpenseCategory, ...ExpenseCategory[]];
/** The categories a plain expense can use (Mileage is the mileage kind's own). */
export const SPEND_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => c.id !== "mileage");

export type SpendCategory = Exclude<ExpenseCategory, "mileage">;
export const isSpendCategory = (id: string): id is SpendCategory =>
  id !== "mileage" && EXPENSE_CATEGORIES.some((c) => c.id === id);

export const categoryLabel = (id: string) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? "Other";

export type ExpenseKind = "expense" | "mileage";
export type DistanceUnit = "mi" | "km";

/**
 * The mileage rate a new trip starts with: 70 cents a mile, the IRS standard rate for 2025. It is only a starting
 * point: the person changes it to the rate that applies to them (another year, another country). Not tax advice.
 */
export const DEFAULT_MILEAGE_RATE = 700;

/** Largest amount one expense may hold: $1,000,000.00. */
export const MAX_EXPENSE_CENTS = 100_000_000;
/** Longest trip: 100,000.0 miles or kilometres. */
export const MAX_DISTANCE = 1_000_000;
/** Highest rate: $10.000 a mile. */
export const MAX_MILEAGE_RATE = 10_000;
export const MAX_NOTE = 500;

/** The cents a trip is worth: distance (tenths) × rate (tenths of a cent), rounded to the nearest cent. */
export function mileageCents(distance: number, rate: number): number {
  return Math.round((distance * rate) / 100);
}

/** Reads a number the way people type it ("1,234.50", "12,5" with a decimal comma), or null. */
function readNumber(text: string): number | null {
  let t = text
    .trim()
    .replace(/^[$€£]/, "")
    .replace(/\s/g, "");
  // "1,234.56" (thousands comma) vs "12,5" (decimal comma): a comma followed by exactly 1 or 2 digits at the end, with
  // no dot, is a decimal comma.
  if (!t.includes(".") && /,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  t = t.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** "12.50" → 1250 cents. A blank, zero, negative or too large amount is an error in plain words. */
export function parseAmount(text: string): { cents: number } | { error: string } {
  const n = readNumber(text);
  if (n === null) return { error: "Type the amount as a number, like 12.50." };
  const cents = Math.round(n * 100);
  if (cents < 1) return { error: "The amount must be more than zero." };
  if (cents > MAX_EXPENSE_CENTS) return { error: "That amount is too large for one expense." };
  return { cents };
}

/** "12.3" → 123 tenths. */
export function parseDistance(text: string): { distance: number } | { error: string } {
  const n = readNumber(text);
  if (n === null) return { error: "Type the distance as a number, like 12.5." };
  const distance = Math.round(n * 10);
  if (distance < 1) return { error: "The distance must be more than zero." };
  if (distance > MAX_DISTANCE) return { error: "That distance is too long for one trip." };
  return { distance };
}

/** "70" or "0.70"? People write a mileage rate in cents ("70") or in dollars ("0.70"); under 10 means dollars. */
export function parseMileageRate(text: string): { rate: number } | { error: string } {
  const n = readNumber(text);
  if (n === null) return { error: "Type the rate as a number, like 0.70." };
  const rate = Math.round((n < 10 ? n * 100 : n) * 10);
  if (rate < 1) return { error: "The rate must be more than zero." };
  if (rate > MAX_MILEAGE_RATE) return { error: "That rate is too high." };
  return { rate };
}

/** For filling the boxes again when an expense is edited. */
export const amountInput = (cents: number) => (cents / 100).toFixed(2);
export const distanceInput = (distance: number) => String(distance / 10);
/** 700 → "0.70", 725 → "0.725" (a rate in dollars per mile or kilometre). */
export const rateInput = (rate: number) => (rate / 1000).toFixed(rate % 10 === 0 ? 2 : 3);

/** "12.3 mi at 0.70 per mile". */
export function describeTrip(distance: number, unit: string, rate: number): string {
  const per = unit === "km" ? "km" : "mile";
  return `${distance / 10} ${unit === "km" ? "km" : "mi"} at ${rateInput(rate)} per ${per}`;
}

export type ExpenseRow = {
  date: string;
  category: string;
  amount_cents: number;
  kind: string;
  distance: number | null;
};

export type ExpenseSummary = {
  count: number;
  totalCents: number;
  /** Every category with money in it, largest first. */
  byCategory: { category: string; label: string; count: number; cents: number }[];
  /** Q1 to Q4 of the year. */
  byQuarter: { quarter: number; cents: number }[];
  /** Trips: how far (tenths, per unit) and what they came to. */
  mileage: { trips: number; cents: number; distance: { mi: number; km: number } };
};

/** The year's expenses added up by category and by quarter. Rows outside `year` are left out. */
export function summarizeExpenses(rows: (ExpenseRow & { distance_unit?: string | null })[], year: number) {
  const prefix = `${year}-`;
  const inYear = rows.filter((r) => r.date.startsWith(prefix));
  const cats = new Map<string, { count: number; cents: number }>();
  const quarters = [0, 0, 0, 0];
  const mileage = { trips: 0, cents: 0, distance: { mi: 0, km: 0 } };
  let totalCents = 0;
  for (const r of inYear) {
    totalCents += r.amount_cents;
    const c = cats.get(r.category) ?? { count: 0, cents: 0 };
    cats.set(r.category, { count: c.count + 1, cents: c.cents + r.amount_cents });
    quarters[Math.floor((Number(r.date.slice(5, 7)) - 1) / 3)] += r.amount_cents;
    if (r.kind === "mileage") {
      mileage.trips += 1;
      mileage.cents += r.amount_cents;
      mileage.distance[r.distance_unit === "km" ? "km" : "mi"] += r.distance ?? 0;
    }
  }
  const byCategory = [...cats.entries()]
    .map(([category, v]) => ({ category, label: categoryLabel(category), ...v }))
    .sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label));
  return {
    count: inYear.length,
    totalCents,
    byCategory,
    byQuarter: quarters.map((cents, i) => ({ quarter: i + 1, cents })),
    mileage,
  } satisfies ExpenseSummary;
}

/** What came in (payments received) less what went out. An estimate for planning, not a tax figure. */
export const netCents = (receivedCents: number, expenseCents: number) => receivedCents - expenseCents;

export const NET_NOTE =
  "Net is payments received minus the expenses you recorded here. It is an estimate to plan with, not tax advice: what you may deduct depends on where you live.";

/** What the add/edit form holds: the text of each box. */
export type ExpenseFields = {
  kind: ExpenseKind;
  date: string;
  amount: string;
  category: string;
  distance: string;
  unit: DistanceUnit;
  rate: string;
  note: string;
  clientId: string;
};

/** What `expense.create` and `expense.update` take. */
export type ExpenseDraft =
  | {
      kind: "expense";
      date: string;
      category: SpendCategory;
      amountCents: number;
      note: string;
      clientId: string | null;
    }
  | {
      kind: "mileage";
      date: string;
      distance: number;
      unit: DistanceUnit;
      rate: number;
      note: string;
      clientId: string | null;
    };

/** Reads the form's boxes into what the server takes, or the first problem in plain words. */
export function readExpenseFields(f: ExpenseFields): { draft: ExpenseDraft } | { error: string } {
  if (!f.date) return { error: "Pick a date." };
  const common = { date: f.date, note: f.note.trim(), clientId: f.clientId || null };
  if (f.kind === "mileage") {
    const d = parseDistance(f.distance);
    if ("error" in d) return d;
    const r = parseMileageRate(f.rate);
    if ("error" in r) return r;
    return { draft: { kind: "mileage", ...common, distance: d.distance, unit: f.unit, rate: r.rate } };
  }
  const a = parseAmount(f.amount);
  if ("error" in a) return a;
  const category = isSpendCategory(f.category) ? f.category : "other";
  return { draft: { kind: "expense", ...common, category, amountCents: a.cents } };
}

/** An expense as the list holds it, back into the form's boxes (or a fresh form on `date`). */
export function expenseFields(
  initial:
    | {
        kind: string;
        date: string;
        category: string;
        amount_cents: number;
        note: string | null;
        client_id: string | null;
        distance: number | null;
        distance_unit: string | null;
        mileage_rate: number | null;
      }
    | undefined,
  date: string,
): ExpenseFields {
  const trip = initial?.kind === "mileage";
  return {
    kind: trip ? "mileage" : "expense",
    date: initial?.date ?? date,
    amount: initial && !trip ? amountInput(initial.amount_cents) : "",
    category: initial && !trip ? initial.category : SPEND_CATEGORIES[0].id,
    distance: initial?.distance ? distanceInput(initial.distance) : "",
    unit: initial?.distance_unit === "km" ? "km" : "mi",
    rate: rateInput(initial?.mileage_rate ?? DEFAULT_MILEAGE_RATE),
    note: initial?.note ?? "",
    clientId: initial?.client_id ?? "",
  };
}
