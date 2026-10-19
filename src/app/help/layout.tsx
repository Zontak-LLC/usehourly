import type { ReactNode } from "react";

import Link from "next/link";

import { LogoMark } from "@/components/logo";

/** The frame for the guide and FAQ: public, so it can be linked from anywhere and read with no account. */
export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <LogoMark className="size-7" />
          UseHourly
        </Link>
        <nav aria-label="Guide" className="flex items-center gap-1 text-sm">
          <Link href="/help" prefetch={false} className="rounded-lg px-3 py-2 hover:bg-muted">
            Guide
          </Link>
          <Link href="/help/faq" prefetch={false} className="rounded-lg px-3 py-2 hover:bg-muted">
            FAQ
          </Link>
          <Link
            href="/dashboard/today"
            prefetch={false}
            className="rounded-lg border bg-card px-3 py-2 font-medium hover:bg-muted"
          >
            Open the app
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">{children}</main>
    </div>
  );
}
