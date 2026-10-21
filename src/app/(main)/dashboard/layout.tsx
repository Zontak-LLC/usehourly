import type { ReactNode } from "react";

import Link from "next/link";
import { redirect } from "next/navigation";

import { cn } from "cn";

import { CurrencyProvider } from "@/components/currency-provider";
import { DemoBanner } from "@/components/demo-banner";
import { GoogleCalendarProvider } from "@/components/google-calendar-config";
import { GuideKeeper } from "@/components/guide-keeper";
import { LocalFirst } from "@/components/local-first";
import { LogoMark } from "@/components/logo";
import { OfflineGuard } from "@/components/offline-guard";
import { OfflineSync } from "@/components/offline-sync";
import { SupportNotice } from "@/components/support-notice";
import { SwipeNav } from "@/components/swipe-nav";
import { ThemeSync } from "@/components/theme-sync";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { UsageBeacon } from "@/components/usage-beacon";
import { GUIDE_PATHS, GUIDE_VERSION } from "@/content/guide";
import { isAdminUser } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { donateUrl } from "@/lib/donate";
import { googleCalendarClientIdFor } from "@/lib/google-calendar-config";
import { getPrisma } from "@/lib/prisma";
import { sessionStillValid } from "@/lib/session-version";
import { readSavedTheme } from "@/lib/theme-sync";
import { readSupportNotice } from "@/server/support-notice";

import { GuideButton } from "./_components/header/guide-button";
import { LayoutControls } from "./_components/header/layout-controls";
import { MobileNav } from "./_components/header/mobile-nav";
import { SideNav } from "./_components/header/side-nav";
import { ThemeSwitcher } from "./_components/header/theme-switcher";
import { UserMenu } from "./_components/header/user-menu";

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await auth();
  // The proxy already sends signed-out visitors away; this is the second lock on the same door.
  if (!session?.user?.id) redirect("/auth/v2/login");
  // Read the name from the DB, not the JWT, so profile edits show up immediately.
  const prisma = await getPrisma();
  // The owner's "chip in" note is read in the same round trip as the person, so it adds no waiting.
  const [dbUser, supportNotice] = await Promise.all([
    prisma.authUser.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        token_version: true,
        theme_preset: true,
        theme_mode: true,
        email_verified_at: true,
        is_demo: true,
        currency: true,
        avatar: true,
      },
    }),
    readSupportNotice(prisma),
  ]);
  // Signed in with an old token (password changed, signed out everywhere, or the account is gone):
  // clear the cookie through a route handler, then land on the login page.
  if (session?.user?.id && !sessionStillValid(session.user.tv, dbUser?.token_version)) {
    redirect("/api/session-expired");
  }
  const user = { name: dbUser?.name ?? "You", email: dbUser?.email ?? "", avatar: dbUser?.avatar ?? null };
  const savedTheme = readSavedTheme(dbUser ?? {});
  const isAdmin = isAdminUser(dbUser);
  return (
    <OfflineGuard userId={session.user.id}>
      <LocalFirst userId={session.user.id} isDemo={Boolean(dbUser?.is_demo)} />
      <GoogleCalendarProvider clientId={googleCalendarClientIdFor({ isAdmin, isDemo: Boolean(dbUser?.is_demo) })}>
        <CurrencyProvider currency={dbUser?.currency ?? "USD"}>
          <SidebarProvider
            style={
              {
                "--sidebar-width": "calc(var(--spacing) * 68)",
              } as React.CSSProperties
            }
          >
            <SideNav isAdmin={isAdmin} />
            <SidebarInset
              className={cn(
                "[html[data-content-layout=centered]_&>*]:mx-auto",
                "[html[data-content-layout=centered]_&>*]:w-full",
                "[html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
                "peer-data-[variant=inset]:border",
                "[--dashboard-header-height:--spacing(12)]",
                "min-w-0 overflow-x-clip",
              )}
            >
              <UsageBeacon />
              <SwipeNav />
              <GuideKeeper paths={GUIDE_PATHS} version={GUIDE_VERSION} />
              <ThemeSync saved={savedTheme} enabled={session?.user?.demo !== true} />
              {session?.user?.demo === true && <DemoBanner />}
              <header
                className={cn(
                  "flex h-12 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
                  // Handle sticky navbar style with conditional classes so blur, background, z-index, and rounded corners remain consistent across all SidebarVariant layouts.
                  "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
                )}
              >
                <div className="flex w-full items-center justify-between px-4 lg:px-6">
                  <div className="flex items-center gap-1 lg:gap-2">
                    <Link
                      href="/dashboard/today"
                      className="flex items-center gap-2 font-semibold text-base lg:[html[data-nav-position=left]_&]:hidden"
                    >
                      <LogoMark className="size-6 shrink-0" aria-hidden />
                      UseHourly
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <GuideButton />
                    <LayoutControls />
                    <ThemeSwitcher />
                    <UserMenu user={user} />
                  </div>
                </div>
              </header>
              <MobileNav isAdmin={isAdmin} />
              {/* Pages can set data-content-padding="false" to render full-bleed app layouts. */}
              <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-2 has-data-[content-padding=false]:p-0 max-sm:pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-6 md:has-data-[content-padding=false]:p-0">
                <OfflineSync />
                <SupportNotice cost={dbUser?.is_demo ? null : (supportNotice?.cost ?? null)} url={donateUrl()} />
                {children}
              </div>
            </SidebarInset>
          </SidebarProvider>
        </CurrencyProvider>
      </GoogleCalendarProvider>
    </OfflineGuard>
  );
}
