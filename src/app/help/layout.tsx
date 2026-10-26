import type { ReactNode } from "react";

import Link from "next/link";

import { cn } from "cn";
import { UserRound } from "lucide-react";

import { GlobalSearch } from "@/components/global-search";
import { LogoMark } from "@/components/logo";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "@/lib/auth";

import { AppearanceControl } from "../(main)/dashboard/_components/header/appearance-control";
import { MobileNav } from "../(main)/dashboard/_components/header/mobile-nav";
import { SideNav } from "../(main)/dashboard/_components/header/side-nav";
import { ThemeSwitcher } from "../(main)/dashboard/_components/header/theme-switcher";

/**
 * The frame for the Help page: public (linked from anywhere, readable with no account) and kept by the service worker
 * once opened, so it holds NOTHING personal. A signed-in person gets the app's own navigation (the tab bar, the optional
 * left menu, search, the light/dark switch, and a plain Account button in place of the named account menu) built without
 * a name or address. A visitor with no account is not shown the app's pages (they would
 * only lead to sign-in): they get a plain header with the logo, Log in and Create account.
 */
export default async function HelpLayout({ children }: { children: ReactNode }) {
  const signedIn = Boolean((await auth())?.user);
  return (
    <SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 68)" } as React.CSSProperties}>
      {signedIn && <SideNav />}
      <SidebarInset className={cn("min-w-0 overflow-x-clip", "[--dashboard-header-height:--spacing(12)]")}>
        <header className="sticky top-0 z-50 flex h-12 shrink-0 items-center gap-2 bg-background/50 backdrop-blur-md">
          <div className="flex w-full items-center justify-between px-4 lg:px-6">
            <Link
              href={signedIn ? "/dashboard/today" : "/"}
              className={cn(
                "flex items-center gap-2 font-semibold text-base",
                signedIn && "lg:[html[data-nav-position=left]_&]:hidden",
              )}
            >
              <LogoMark className="size-6 shrink-0" aria-hidden />
              UseHourly
            </Link>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              {signedIn ? (
                <>
                  <GlobalSearch />
                  <AppearanceControl />
                  <Link
                    href="/dashboard/account"
                    aria-label="Account"
                    title="Account"
                    className="grid size-10 place-items-center rounded-lg border bg-card outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <UserRound aria-hidden className="size-4" />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/v2/login"
                    className="whitespace-nowrap rounded-lg px-2.5 py-2 font-medium text-sm hover:bg-muted sm:px-3"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/auth/v2/register"
                    className="whitespace-nowrap rounded-lg border border-tint-edge bg-tint px-2.5 py-2 font-medium text-foreground text-sm hover:bg-tint-hover sm:px-3"
                  >
                    Create account
                  </Link>
                </>
              )}
              {!signedIn && <ThemeSwitcher />}
            </div>
          </div>
        </header>
        {signedIn && <MobileNav />}
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-2 max-sm:pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-6">
          <main className="mx-auto w-full min-w-0 max-w-2xl px-2 pt-4 pb-12 sm:px-0 sm:pt-8">{children}</main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
