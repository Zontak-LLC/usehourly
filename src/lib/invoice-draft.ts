import { fromISODate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/*
 * The email a freelancer sends about an invoice from their OWN mail app (issue 227). UseHourly only writes the draft:
 * the person reads it in Gmail, Outlook or Apple Mail and presses Send there, so nothing leaves by surprise.
 */

export type InvoiceDraftInput = {
  number: string;
  sellerName: string;
  totalCents: number;
  currency: string;
  periodFrom: string;
  periodTo: string;
  issueDate: string;
  dueDate: string | null;
  paidDate: string | null;
  /** The private invoice page, or null when no link could be made (the PDF is then attached by hand). */
  link: string | null;
};

/**
 * Mail apps and browsers cut long mailto addresses (Outlook on Windows near 2,000 characters). Past this length the
 * panel says to use Copy message instead.
 */
export const MAILTO_SAFE_LENGTH = 1800;

const longDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmt = (iso: string) => longDate.format(fromISODate(iso));

/** "Invoice INV-2026-004 from Jo LLC" (without "from" when the business has no name). */
function invoiceTitle(d: InvoiceDraftInput) {
  const seller = d.sellerName.trim();
  return seller ? `Invoice ${d.number} from ${seller}` : `Invoice ${d.number}`;
}

/** "invoice INV-2026-004 for $1,187.50, for work from Oct 1, 2026 to Oct 31, 2026" */
function whatItIs(d: InvoiceDraftInput) {
  const amount = formatMoney(d.totalCents, d.currency);
  return `invoice ${d.number} for ${amount}, for work from ${fmt(d.periodFrom)} to ${fmt(d.periodTo)}`;
}

/** The end both emails share: where to see the invoice (the private link, or the attached PDF) and the sign-off. */
function closingLines(d: InvoiceDraftInput) {
  const lines = [""];
  if (d.link) lines.push("You can view the invoice and download the PDF here:", d.link);
  else lines.push("The invoice is attached as a PDF.");
  lines.push("", "Thank you!");
  if (d.sellerName.trim()) lines.push(d.sellerName.trim());
  return lines;
}

/** The subject and the message, in plain words, ready to edit. */
export function invoiceDraft(d: InvoiceDraftInput): { subject: string; body: string } {
  const lines = ["Hello,", "", `Here is ${whatItIs(d)}.`];
  if (d.paidDate) lines.push(`It is paid (${fmt(d.paidDate)}). This copy is for your records.`);
  else if (d.dueDate && d.dueDate <= d.issueDate) lines.push("Payment is due on receipt.");
  else if (d.dueDate) lines.push(`Payment is due by ${fmt(d.dueDate)}.`);
  return { subject: invoiceTitle(d), body: [...lines, ...closingLines(d)].join("\n") };
}

/**
 * A polite reminder for an unpaid invoice past its due date (issue 100), written for the person's own mail app like
 * the invoice email. `daysLate` comes from `daysLate` in lib/invoice-mail.ts, the one "is it late" rule.
 */
export function reminderDraft(d: InvoiceDraftInput & { daysLate: number }): { subject: string; body: string } {
  const ago = d.daysLate === 1 ? "1 day ago" : `${d.daysLate} days ago`;
  const due = d.dueDate ? `was due on ${fmt(d.dueDate)}, ${ago}` : `was due ${ago}`;
  const lines = [
    "Hello,",
    "",
    `A friendly reminder: ${whatItIs(d)}, ${due}, and I have not received the payment yet.`,
    "If it is already on its way, thank you, and please ignore this note.",
  ];
  return { subject: `Reminder: ${invoiceTitle(d)} is overdue`, body: [...lines, ...closingLines(d)].join("\n") };
}

/** Encodes one part of a mailto address (RFC 6068): line breaks become CRLF, everything else is percent-encoded. */
function encodePart(text: string) {
  return encodeURIComponent(text.replace(/\r?\n/g, "\r\n"));
}

/**
 * A mailto address that opens the person's mail app with the address, subject and message filled in. The recipient
 * keeps its @ and commas readable (some mail apps refuse %40); anything else in it is encoded, so a typed "?" or "&"
 * cannot add a header such as Bcc.
 */
export function mailtoHref(to: string, subject: string, body: string) {
  const recipients = to
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => encodeURIComponent(a).replace(/%40/g, "@"))
    .join(",");
  return `mailto:${recipients}?subject=${encodePart(subject)}&body=${encodePart(body)}`;
}

/** A safe file name for the PDF attachment. */
export function pdfFileName(number: string) {
  return `${number.replace(/[^\w.-]+/g, "_")}.pdf`;
}
