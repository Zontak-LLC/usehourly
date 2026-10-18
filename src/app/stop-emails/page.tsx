import type { Metadata } from "next";

import { verifyStopEmailToken } from "@/lib/reminder-token";

export const metadata: Metadata = { title: "Stop emails · UseHourly", robots: { index: false } };

type Props = { searchParams: Promise<{ e?: string; t?: string; done?: string }> };

/** The page behind "Stop these emails" in an invoice email. Nothing changes until the button is pressed. */
export default async function StopEmailsPage({ searchParams }: Props) {
  const { e = "", t = "", done } = await searchParams;
  const valid = await verifyStopEmailToken(process.env.AUTH_SECRET ?? "", e, t);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="font-semibold text-2xl">Stop these emails</h1>
      {done ? (
        <p>Done. We won&rsquo;t send invoice emails to that address any more.</p>
      ) : valid ? (
        <>
          <p>
            Stop invoice emails sent through UseHourly to <strong className="break-all">{e}</strong>?
          </p>
          <form method="post" action={`/api/stop-emails?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`}>
            <input type="hidden" name="page" value="1" />
            <button
              type="submit"
              className="h-11 rounded-lg border border-primary/35 bg-primary/20 px-6 font-medium text-foreground hover:bg-primary/30"
            >
              Yes, stop them
            </button>
          </form>
          <p className="text-muted-foreground text-sm">
            The person who sent the invoice can still reach you any other way. This only stops UseHourly from emailing
            you.
          </p>
        </>
      ) : (
        <p>This link isn&rsquo;t valid.</p>
      )}
    </main>
  );
}
