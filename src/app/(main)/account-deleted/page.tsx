import Link from "next/link";

import type { Metadata } from "next";

import { LogoMark } from "@/components/logo";

export const metadata: Metadata = {
  title: "Account deleted · UseHourly",
  robots: { index: false },
};

/** Where deleting an account lands (issue 219): it used to drop people on the home page with no word. */
export default function AccountDeletedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-card p-6 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10">
        <LogoMark className="size-8" aria-hidden />
        <h1 className="font-semibold text-2xl tracking-tight">Your account is deleted</h1>
        <p className="text-foreground/80">
          Your clients, projects, time entries, invoices and settings were removed. Copies kept by our hosting provider
          for disaster recovery expire on their own within 30 days.
        </p>
        <p className="text-foreground/80">Thank you for using UseHourly.</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/" className="font-medium underline underline-offset-4">
            Back to the home page
          </Link>
          <Link href="/auth/v2/register" className="font-medium underline underline-offset-4">
            Start a new account
          </Link>
        </div>
      </div>
    </main>
  );
}
