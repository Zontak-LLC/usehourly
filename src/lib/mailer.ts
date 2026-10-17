import { renderEmail } from "./email-template";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  /** The styled version; `text` is always sent too, so apps that block HTML still show the message. */
  html?: string;
  /** Shown as the sender's name, with the app's own address: "Ada via UseHourly" <hi@usehourly...>. */
  fromName?: string;
  /** Where a reply goes (the freelancer, for a client's email). */
  replyTo?: string;
  /** Extra headers, such as List-Unsubscribe. */
  headers?: Record<string, string>;
};

/**
 * The From line for a message: the app's own configured address, optionally with a display name. The name is cleaned
 * (no quotes, brackets or control characters), so it cannot change the address or add headers.
 */
/** Replaces control characters (line breaks, NUL, the Unicode line separators) with a space, without a regex over them. */
const stripControl = (value: string): string =>
  [...value]
    .map((ch) => {
      const c = ch.charCodeAt(0);
      return c < 32 || c === 127 || c === 0x2028 || c === 0x2029 ? " " : ch;
    })
    .join("");

export function senderFrom(configured: string, name?: string): string {
  if (!name) return configured;
  const address = (/<([^>]+)>/.exec(configured)?.[1] ?? configured).trim();
  const safe = stripControl(name)
    .replace(/["<>\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return safe ? `"${safe}" <${address}>` : configured;
}
export type Mailer = { send(message: MailMessage): Promise<void> };

/**
 * Sends mail through Resend (https://resend.com), using only `fetch`, which works on Workers.
 * Returns null when RESEND_API_KEY or EMAIL_FROM is not set: the features that need email then
 * switch themselves off and say so, instead of pretending to send.
 */
export function createMailer(env: Record<string, string | undefined> = process.env): Mailer | null {
  const key = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!key || !from) return null;
  return {
    async send({ to, subject, text, html, headers, fromName, replyTo }) {
      const res = await fetch(`${(env.RESEND_API_URL || "https://api.resend.com").replace(/\/+$/, "")}/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: senderFrom(from, fromName),
          to,
          subject,
          text,
          ...(html && { html }),
          ...(replyTo && { reply_to: replyTo }),
          ...(headers && { headers }),
        }),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        throw new Error(`The email service refused the message (${res.status}). ${detail}`);
      }
    },
  };
}

/** The app's public address, without a trailing slash, for links inside emails. */
export function appUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.NEXT_PUBLIC_APP_URL || env.AUTH_URL || "http://localhost:3028").replace(/\/+$/, "");
}

export function verifyEmailMessage(to: string, link: string): MailMessage {
  const mail = renderEmail({
    title: "Confirm your email",
    greeting: "Hi,",
    blocks: [
      "Please confirm this email address for your UseHourly account:",
      { button: { label: "Confirm my email", url: link } },
      "The link works for 24 hours. If you did not create an account, you can ignore this message.",
    ],
  });
  return { to, subject: "Confirm your email for UseHourly", ...mail };
}

export function resetPasswordMessage(to: string, link: string): MailMessage {
  const mail = renderEmail({
    title: "Reset your password",
    greeting: "Hi,",
    blocks: [
      "Someone asked to reset the password for this UseHourly account. To choose a new one, open:",
      { button: { label: "Choose a new password", url: link } },
      "The link works for 1 hour and only once. If this was not you, you can ignore this message and your password stays the same.",
    ],
  });
  return { to, subject: "Reset your UseHourly password", ...mail };
}

/** Text that came from a stranger (a client's typed name) made safe for a subject line: no line breaks or control characters. */
const oneLine = (value: string, max: number) => stripControl(value).replace(/\s+/g, " ").trim().slice(0, max);

/** Tells the freelancer a client approved a shared timesheet. */
export function timesheetApprovedMessage(
  to: string,
  d: { approver: string; title: string; note: string | null; link: string },
): MailMessage {
  const approver = oneLine(d.approver, 80) || "Your client";
  const mail = renderEmail({
    title: "A client approved your timesheet",
    greeting: "Hi,",
    blocks: [
      `${approver} approved the hours you shared:`,
      { heading: oneLine(d.title, 160) },
      ...(d.note ? ["They added a note:", { quote: d.note.slice(0, 500) }] : []),
      "You can see all your shared timesheets here:",
      { button: { label: "Open my timesheets", url: d.link } },
    ],
  });
  return { to, subject: `${approver} approved your timesheet`, ...mail };
}

/**
 * An invoice sent to a client, or a reminder that it is overdue. The freelancer's own words are quoted under a fixed lead
 * ("A note from <name>"), so they cannot pass as UseHourly speaking. Every message carries a one-click way to stop them.
 */
export function invoiceEmailMessage(
  to: string,
  d: {
    kind: "invoice" | "reminder";
    sellerName: string;
    sellerEmail: string;
    number: string;
    totalLabel: string;
    dueLabel: string | null;
    note: string | null;
    link: string;
    stopUrl: string;
    oneClickUrl: string;
  },
): MailMessage {
  const seller = oneLine(d.sellerName, 80) || "Your contact";
  const number = oneLine(d.number, 40);
  const summary = `${number} · ${d.totalLabel}${d.dueLabel ? ` · due ${d.dueLabel}` : ""}`;
  const reminder = d.kind === "reminder";
  const mail = renderEmail({
    title: reminder ? `Reminder: invoice ${number}` : `Invoice ${number}`,
    greeting: "Hi,",
    blocks: [
      reminder
        ? `This is a friendly reminder that an invoice from ${seller} is past its due date and isn't marked as paid yet:`
        : `${seller} sent you an invoice:`,
      { heading: summary },
      ...(d.note ? [`A note from ${seller}:`, { quote: d.note.slice(0, 1000) }] : []),
      { button: { label: reminder ? "View the invoice and how to pay" : "View the invoice", url: d.link } },
      reminder
        ? "If you have already paid, thank you, and please ignore this message."
        : `Questions about it? Reply to this email and your reply goes to ${seller}.`,
    ],
    footnote: {
      text: `You're getting this because ${seller} sent you an invoice through UseHourly.`,
      link: { label: "Stop these emails", url: d.stopUrl },
    },
  });
  return {
    to,
    subject: reminder ? `Reminder: invoice ${number} from ${seller}` : `Invoice ${number} from ${seller}`,
    ...mail,
    fromName: `${seller} via UseHourly`,
    replyTo: d.sellerEmail,
    headers: {
      "List-Unsubscribe": `<${d.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
