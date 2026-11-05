import type { Metadata } from "next";

import { verifyUnsubscribeToken } from "@/lib/reminder-token";

export const metadata: Metadata = { title: "Weekly reminder · UseHourly", robots: { index: false } };

type Props = { searchParams: Promise<{ u?: string; t?: string; done?: string }> };

/** The page behind the "turn it off" link in the reminder email. Nothing changes until the button is pressed. */
export default async function ReminderOffPage({ searchParams }: Props) {
  const { u = "", t = "", done } = await searchParams;
  const valid = await verifyUnsubscribeToken(process.env.AUTH_SECRET ?? "", u, t);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="font-semibold text-2xl">Friday reminder</h1>
      {done ? (
        <p>Done. You won&rsquo;t get the Friday reminder any more. You can turn it back on any time under Account.</p>
      ) : valid ? (
        <>
          <p>Stop the weekly &ldquo;log your hours&rdquo; email?</p>
          <form method="post" action={`/api/reminders/off?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`}>
            <input type="hidden" name="page" value="1" />
            <button
              type="submit"
              className="h-11 rounded-lg border border-tint-edge bg-tint px-6 font-medium text-foreground hover:bg-tint-hover"
            >
              Yes, turn it off
            </button>
          </form>
        </>
      ) : (
        <p>This link isn&rsquo;t valid. You can turn the reminder off under Account in UseHourly.</p>
      )}
    </main>
  );
}
