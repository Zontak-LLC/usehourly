import type { ReactNode } from "react";

import Link from "next/link";

import { cn } from "cn";

import { LogoMark } from "@/components/logo";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { GROUPS, TOPICS } from "@/content/guide";
import { auth } from "@/lib/auth";

import { LayoutControls } from "../(main)/dashboard/_components/header/layout-controls";
import { MobileNav } from "../(main)/dashboard/_components/header/mobile-nav";
import { SideNav } from "../(main)/dashboard/_components/header/side-nav";
import { ThemeSwitcher } from "../(main)/dashboard/_components/header/theme-switcher";
import { GuideSideNav } from "./guide-side-nav";

/**
 * The frame for the guide and FAQ: public (linked from anywhere, readable with no account) and offline-cached, so it
 * holds NOTHING personal. A signed-in person gets the app's own navigation (the tab bar, the optional left menu, the
 * settings gear) built without a name or address. A visitor with no account is not shown the app's pages (they would
 * only lead to sign-in): they get a plain header with the logo, Log in and Create account.
 */
export default async function HelpLayout({ children }: { children: ReactNode }) {
  const signedIn = Boolean((await auth())?.user);
  const groups = GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    topics: TOPICS.filter((t) => t.group === g.id).map((t) => ({ slug: t.slug, title: t.title })),
  }));
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
            <div className="ml-auto flex items-center gap-2">
              {signedIn ? (
                <LayoutControls />
              ) : (
                <>
                  <Link href="/auth/v2/login" className="rounded-lg px-3 py-2 font-medium text-sm hover:bg-muted">
                    Log in
                  </Link>
                  <Link
                    href="/auth/v2/register"
                    className="rounded-lg border border-tint-edge bg-tint px-3 py-2 font-medium text-foreground text-sm hover:bg-tint-hover"
                  >
                    Create account
                  </Link>
                </>
              )}
              {/* A signed-in person has the Light, Dark and System choice in the gear menu; a visitor has no gear. */}
              {!signedIn && <ThemeSwitcher />}
            </div>
          </div>
        </header>
        {signedIn && <MobileNav />}
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-2 max-sm:pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-6">
          <div
            className={cn(
              "mx-auto w-full max-w-5xl px-2 pb-12 sm:px-0 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10",
              signedIn && "lg:[html[data-nav-position=left]_&]:block",
            )}
          >
            <GuideSideNav groups={groups} followAppMenu={signedIn} />
            <main className="min-w-0 max-w-3xl">{children}</main>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
