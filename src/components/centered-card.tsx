import type { ReactNode } from "react";

import Link from "next/link";

import { LogoMark } from "@/components/logo";

/** A plain centered page for the emailed-link pages (reset password, verify email). */
export function CenteredCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-6 pt-10 text-foreground">
      <Link href="/" className="mb-8 flex items-center gap-2 font-semibold text-lg">
        <LogoMark className="size-7" />
        UseHourly
      </Link>
      <main className="w-full max-w-sm space-y-6">
        <h1 className="text-center font-medium text-2xl">{title}</h1>
        {children}
      </main>
    </div>
  );
}
