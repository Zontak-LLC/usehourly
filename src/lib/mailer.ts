export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  /** Extra headers, such as List-Unsubscribe. */
  headers?: Record<string, string>;
};
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
    async send({ to, subject, text, headers }) {
      const res = await fetch(`${(env.RESEND_API_URL || "https://api.resend.com").replace(/\/+$/, "")}/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text, ...(headers && { headers }) }),
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
  return {
    to,
    subject: "Confirm your email for UseHourly",
    text: `Hi,\n\nPlease confirm this email address for your UseHourly account:\n\n${link}\n\nThe link works for 24 hours. If you did not create an account, you can ignore this message.\n\nUseHourly`,
  };
}

export function resetPasswordMessage(to: string, link: string): MailMessage {
  return {
    to,
    subject: "Reset your UseHourly password",
    text: `Hi,\n\nSomeone asked to reset the password for this UseHourly account. To choose a new one, open:\n\n${link}\n\nThe link works for 1 hour and only once. If this was not you, you can ignore this message and your password stays the same.\n\nUseHourly`,
  };
}

/** Text that came from a stranger (a client's typed name) made safe for a subject line: no line breaks or control characters. */
const oneLine = (value: string, max: number) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
  value
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Tells the freelancer a client approved a shared timesheet. Plain text, like every other message. */
export function timesheetApprovedMessage(
  to: string,
  d: { approver: string; title: string; note: string | null; link: string },
): MailMessage {
  const approver = oneLine(d.approver, 80) || "Your client";
  const note = d.note ? `\nThey added a note:\n\n"${d.note.slice(0, 500)}"\n` : "";
  return {
    to,
    subject: `${approver} approved your timesheet`,
    text: `Hi,\n\n${approver} approved the hours you shared:\n\n${oneLine(d.title, 160)}\n${note}\nYou can see all your shared timesheets here:\n\n${d.link}\n\nUseHourly`,
  };
}
