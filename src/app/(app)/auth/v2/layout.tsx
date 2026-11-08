import type { ReactNode } from "react";

import Link from "next/link";

import { ThemeSwitcher } from "@/app/(app)/dashboard/_components/header/theme-switcher";
import { LogoMark } from "@/components/logo";

import { AuthSwitchLink } from "../_components/auth-switch-link";

// The form, centered on plain paper (2026-11-08: the glow behind it was removed; the card's hairline edge is enough). The header is ONE
// row in the normal flow (issue 217): logo on the left, the other form's link and the theme switch on the right, so the
// switch can never cover "Log in" and the link can never run into the logo on a phone (they used to be absolutely placed).
export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <header className="relative z-20 flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold font-display text-lg">
          <LogoMark className="size-7" /> UseHourly
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <AuthSwitchLink />
          <ThemeSwitcher />
        </div>
      </header>
      <div className="relative z-10 flex flex-1 items-center justify-center p-2 pb-16">{children}</div>
    </main>
  );
}
