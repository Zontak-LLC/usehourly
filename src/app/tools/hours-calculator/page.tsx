import Link from "next/link";

import type { Metadata } from "next";

import { HoursCalculator } from "@/components/hours-calculator";
import { LogoMark } from "@/components/logo";

export const metadata: Metadata = {
  title: "Hours calculator: add up time and convert to decimal hours | UseHourly",
  description:
    "Add up hours and minutes (1:30, 2h, 45m) and get decimal hours and an invoice amount. Free, nothing is sent anywhere.",
  alternates: { canonical: "/tools/hours-calculator" },
};

export default function HoursCalculatorPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-3xl items-center px-6 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <LogoMark className="size-7" />
          UseHourly
        </Link>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-6 pb-16">
        <h1 className="font-semibold text-3xl tracking-tight">Hours calculator</h1>
        <p className="text-muted-foreground">
          Type your times the way you'd say them, one per line. You get the total as hours:minutes and as decimal hours,
          which is what invoices use. It runs in your browser; nothing is sent anywhere.
        </p>
        <HoursCalculator />
        <section className="space-y-3 leading-relaxed">
          <h2 className="font-semibold text-xl">Converting minutes to decimal hours</h2>
          <p>
            Divide the minutes by 60. 15 minutes is 0.25 hours, 30 is 0.5, 45 is 0.75, and 1:20 is 1.33. Multiply by
            your hourly rate for the amount: 1.33 hours at $85 is about $113.
          </p>
        </section>
        <section className="rounded-xl border bg-muted/40 p-5">
          <p className="font-medium">Tired of adding up hours by hand?</p>
          <p className="mt-1 text-muted-foreground text-sm">
            UseHourly is a free timesheet for freelancers: log your day in seconds, then turn it into a PDF invoice.
          </p>
          <Link href="/" className="mt-3 inline-block font-medium underline underline-offset-4">
            See UseHourly
          </Link>
        </section>
      </main>
    </div>
  );
}
