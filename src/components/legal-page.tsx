import type { ReactNode } from "react";

import Link from "next/link";

import { LogoMark } from "@/components/logo";

/** Plain page frame for the privacy and terms pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-3xl items-center px-6 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <LogoMark className="size-7" />
          UseHourly
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-16">
        <h1 className="font-semibold text-3xl tracking-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground text-sm">Last updated {updated}</p>
        <div className="mt-6 space-y-5 text-base leading-relaxed [&_h2]:mt-8 [&_h2]:font-semibold [&_h2]:text-xl [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
          {children}
        </div>
      </main>
    </div>
  );
}
