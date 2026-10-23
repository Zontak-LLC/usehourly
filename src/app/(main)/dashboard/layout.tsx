import type { ReactNode } from "react";

import Link from "next/link";
import { redirect } from "next/navigation";

import { cn } from "cn";

import { CurrencyProvider } from "@/components/currency-provider";
import { DemoBanner } from "@/components/demo-banner";
import { GlobalSearch } from "@/components/global-search";
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
import { feature } from "@/lib/features";
import { googleCalendarClientIdFor } from "@/lib/google-calendar-config";
import { getPrisma } from "@/lib/prisma";
import { sessionStillValid } from "@/lib/session-version";
import { readSavedTheme } from "@/lib/theme-sync";
import { readSupportNotice } from "@/server/support-notice";

import { GuideButton } from "./_components/header/guide-button";
import { LayoutControls } from "./_components/header/layout-controls";
import { MobileNav } from "./_components/header/mobile-nav";
import { SideNav } from "./_components/header/side-nav";
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
  const isAdmin = isAdminUser(dbUser);
  // With pictures hidden (lib/features.ts) everyone shows their initials, even someone who uploaded a picture before.
  const user = {
    name: dbUser?.name ?? "You",
    email: dbUser?.email ?? "",
    avatar: feature("avatar") ? (dbUser?.avatar ?? null) : null,
  };
  // The calendar hook reads null (no Google button) when the provider is not mounted, so it is left out with the feature.
  const withCalendar = (children: ReactNode) =>
    feature("calendar") ? (
      <GoogleCalendarProvider clientId={googleCalendarClientIdFor({ isAdmin, isDemo: Boolean(dbUser?.is_demo) })}>
        {children}
      </GoogleCalendarProvider>
    ) : (
      children
    );
  const savedTheme = readSavedTheme(dbUser ?? {});
  return (
    <OfflineGuard userId={session.user.id}>
      <LocalFirst userId={session.user.id} isDemo={Boolean(dbUser?.is_demo)} />
      {withCalendar(
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
              {feature("swipe") && <SwipeNav />}
              <GuideKeeper paths={GUIDE_PATHS} version={GUIDE_VERSION} />
              <ThemeSync saved={savedTheme} enabled={session?.user?.demo !== true} />
              {session?.user?.demo === true && <DemoBanner />}
              {/* No backdrop-filter on a phone: it would make the fixed bottom tab bar (inside this header) position itself against the header instead of the screen. */}
              {/* Stuck to the top on a phone (a slim bar) and on a wide screen (one row); in between, the menu pills take a second row, so it scrolls away instead of covering the page. */}
              <header className="top-0 z-40 shrink-0 border-b max-sm:sticky max-sm:bg-background sm:bg-background/85 sm:backdrop-blur-md lg:sticky print:hidden">
                <div className="flex w-full flex-wrap items-center justify-between gap-x-3 px-4 py-2 lg:px-6">
                  <div className="flex min-w-0 items-center gap-1 lg:flex-1 lg:gap-2">
                    <Link
                      href="/dashboard/today"
                      className="flex items-center gap-2 font-display font-extrabold text-lg lg:[html[data-nav-position=left]_&]:hidden"
                    >
                      <LogoMark className="size-6 shrink-0" aria-hidden />
                      UseHourly
                    </Link>
                  </div>
                  <MobileNav isAdmin={isAdmin} />
                  <div className="flex items-center justify-end gap-2 lg:flex-1">
                    <GlobalSearch />
                    <GuideButton />
                    <LayoutControls />
                    <UserMenu user={user} />
                  </div>
                </div>
              </header>
              {/* Pages can set data-content-padding="false" to render full-bleed app layouts. */}
              <div className="min-h-0 min-w-0 flex-1 overflow-x-clip p-2 has-data-[content-padding=false]:p-0 max-sm:pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-6 md:has-data-[content-padding=false]:p-0">
                <OfflineSync />
                <SupportNotice cost={dbUser?.is_demo ? null : (supportNotice?.cost ?? null)} url={donateUrl()} />
                {children}
              </div>
            </SidebarInset>
          </SidebarProvider>
        </CurrencyProvider>,
      )}
    </OfflineGuard>
  );
}
