import type { ReactNode } from "react";

import Link from "next/link";

import { ThemeSwitcher } from "@/app/(main)/dashboard/_components/header/theme-switcher";
import { LogoMark } from "@/components/logo";

// The form, centered on paper: an amber glow behind it (drawing only, never in the way of a click), the logo in the
// corner. The logo and the theme switch sit ABOVE the full-screen layer that centres the form (z-20 over z-10), or that
// layer takes their clicks (found 2026-10-23: the logo did not go home).
export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[46rem] max-w-[160vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--amber)_22%,transparent),transparent)]"
      />
      <Link href="/" className="absolute top-5 left-6 z-20 flex items-center gap-2 font-bold font-display text-lg">
        <LogoMark className="size-7" /> UseHourly
      </Link>
      <div className="absolute top-4 right-5 z-20">
        <ThemeSwitcher />
      </div>
      <div className="relative z-10 flex min-h-dvh items-center justify-center p-2 py-20">{children}</div>
    </main>
  );
}
