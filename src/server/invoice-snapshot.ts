import type { Client, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { buildInvoice, type InvoiceSnapshot } from "@/lib/invoice";
import { effectiveCurrency, formatMoney } from "@/lib/money";
import { isRounding, type Rounding } from "@/lib/rounding";
import { invoiceTax, taxNumberLabel } from "@/lib/tax";

import { nonBillableDates } from "./non-billable";

const MAX_SNAPSHOT_CHARS = 900_000; // D1 rows top out at 2 MB; keep well under

type Db = PrismaClient;

/** What an invoice is asked for: the same input for `invoice.preview` and `invoice.create`. */
export type InvoiceRequest = {
  clientId: string;
  from: string;
  to: string;
  number: string;
  issueDate: string;
  dueDate?: string | null;
  notes: string;
  includeDetail: boolean;
  compactNotes: boolean;
  includeInvoiced: boolean;
  addTax: boolean;
};

/** The caller's own client for an invoice, or NOT_FOUND (another account's client is never found). */
export async function invoiceClient(db: Db, userId: string, clientId: string): Promise<Client> {
  const client = await db.client.findFirst({ where: { id: clientId, user_id: userId } });
  if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
  return client;
}

/** Refuses an invoice number this account already used. */
export async function assertNumberFree(db: Db, userId: string, number: string): Promise<void> {
  const dup = await db.invoice.findFirst({ where: { user_id: userId, number } });
  if (dup) throw new TRPCError({ code: "CONFLICT", message: `Invoice number ${number} is already used.` });
}

/**
 * The one place an invoice is worked out (2026-11-06): the preview shows exactly what Save stores, because both call
 * this. It only reads; `logoHash` decides what happens to the logos (create stores them, the preview only hashes).
 * Refuses a period with nothing to bill, a $0 total and a snapshot too big to store, with the words people see.
 */
export async function buildInvoiceSnapshot(
  db: Db,
  userId: string,
  client: Client,
  input: InvoiceRequest,
  logoHash: (dataUrl: string | null) => Promise<string | null>,
) {
  const [allEntries, skipDays] = await Promise.all([
    db.timeEntry.findMany({
      where: {
        user_id: userId,
        date: { gte: input.from, lte: input.to },
        project: { client_id: client.id },
        ...(input.includeInvoiced ? {} : { invoice_id: null }),
        started_at: null, // a running (or resumed) timer is billed once it is stopped
      },
      include: { project: true },
    }),
    nonBillableDates(db, userId, input),
  ]);
  // Days marked non-billable are never invoiced.
  const entries = allEntries.filter((e) => !skipDays.has(e.date));
  const rounding: Rounding = {
    step: client.round_step ?? 0,
    mode: client.round_mode === "nearest" ? "nearest" : "up",
    min: client.round_min ?? 0,
  };
  const user = await db.authUser.findUnique({ where: { id: userId } });
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
  const currency = effectiveCurrency(client.currency, user.currency); // the client's own, else the account's
  const totals = buildInvoice(entries, rounding);
  if (totals.lines.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: input.includeInvoiced
        ? "No billable time for this client in that period."
        : "No billable time for this client in that period that is not on an invoice already.",
    });
  }
  if (totals.totalCents === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Every project in that period has an hourly rate of ${formatMoney(0, currency).replace(/\.00$/, "")}, so the invoice would be ${formatMoney(0, currency)}. Set the rates under Clients first.`,
    });
  }

  // The rate comes from the account, never from the caller: the browser only says whether to add it.
  const tax = input.addTax ? invoiceTax(totals.totalCents, { name: user.tax_name, rate: user.tax_rate }) : null;
  const totalCents = totals.totalCents + (tax?.cents ?? 0);
  const taxNumber = user.tax_number ? { label: taxNumberLabel(user.tax_name), value: user.tax_number } : null;

  const sellerLogoHash = await logoHash(user.logo);
  const clientLogoHash = await logoHash(client.logo);
  const snapshot: InvoiceSnapshot = {
    currency,
    seller: {
      name: user.business_name || user.name || user.email,
      ein: user.ein,
      address: user.address,
      // A demo account has no real address, so the sample invoice shows an obvious placeholder.
      email: user.is_demo ? "you@yourbusiness.example" : user.email,
      logo: null, // stored once in invoice_logos and referenced by hash (see below)
      logoHash: sellerLogoHash,
      paymentInstructions: user.payment_instructions,
      ...(taxNumber ? { taxNumber } : {}),
    },
    client: {
      name: client.name,
      legalName: client.legal_name,
      address: client.address,
      logo: null,
      logoHash: clientLogoHash,
    },
    number: input.number,
    issueDate: input.issueDate,
    dueDate: input.dueDate ?? null,
    periodFrom: input.from,
    periodTo: input.to,
    notes: input.notes,
    includeDetail: input.includeDetail,
    compactNotes: input.compactNotes,
    lines: totals.lines,
    detail: totals.detail,
    totalMinutes: totals.totalMinutes,
    totalCents,
    ...(tax ? { subtotalCents: totals.totalCents, tax } : {}),
    ...(isRounding(rounding) ? { rounding, loggedMinutes: totals.loggedMinutes } : {}),
  };

  const snapshotText = JSON.stringify(snapshot);
  if (snapshotText.length > MAX_SNAPSHOT_CHARS) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That invoice has too much detail to store. Choose a shorter period, or turn off the time breakdown.",
    });
  }
  /** The snapshot with both logos inline, so the caller can draw the invoice or its PDF at once. */
  const withLogos = {
    ...snapshot,
    seller: { ...snapshot.seller, logo: user.logo },
    client: { ...snapshot.client, logo: client.logo },
  } as InvoiceSnapshot;
  return { snapshot, snapshotText, withLogos, entries, totals, totalCents, currency };
}
