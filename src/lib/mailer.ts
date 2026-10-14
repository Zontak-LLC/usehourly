export type MailMessage = { to: string; subject: string; text: string };
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
    async send({ to, subject, text }) {
      const res = await fetch(`${(env.RESEND_API_URL || "https://api.resend.com").replace(/\/+$/, "")}/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text }),
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
