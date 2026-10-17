import type { ReactNode } from "react";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { cn } from "cn";

import { AppSidebar } from "@/app/(main)/dashboard/_components/sidebar/app-sidebar";
import { DemoBanner } from "@/components/demo-banner";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { sessionStillValid } from "@/lib/session-version";
import { getPreference } from "@/server/server-actions";

import { LayoutControls } from "./_components/header/layout-controls";
import { MobileNav } from "./_components/header/mobile-nav";
import { ThemeSwitcher } from "./_components/header/theme-switcher";

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await auth();
  // The proxy already sends signed-out visitors away; this is the second lock on the same door.
  if (!session?.user?.id) redirect("/auth/v2/login");
  // Read the name from the DB, not the JWT, so profile edits show up immediately.
  const dbUser = session?.user?.id
    ? await (await getPrisma()).authUser.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true, token_version: true },
      })
    : null;
  // Signed in with an old token (password changed, signed out everywhere, or the account is gone):
  // clear the cookie through a route handler, then land on the login page.
  if (session?.user?.id && !sessionStillValid(session.user.tv, dbUser?.token_version)) {
    redirect("/api/session-expired");
  }
  const user = { name: dbUser?.name ?? "You", email: dbUser?.email ?? "" };
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const [variant, collapsible] = await Promise.all([
    getPreference("sidebar_variant"),
    getPreference("sidebar_collapsible"),
  ]);

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 68)",
        } as React.CSSProperties
      }
    >
      <AppSidebar user={user} variant={variant} collapsible={collapsible} />
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
        {session?.user?.demo === true && <DemoBanner />}
        <header
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
            // Handle sticky navbar style with conditional classes so blur, background, z-index, and rounded corners remain consistent across all SidebarVariant layouts.
            "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
          )}
        >
          <div className="flex w-full items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              />
            </div>
            <div className="flex items-center gap-2">
              <LayoutControls />
              <ThemeSwitcher />
            </div>
          </div>
        </header>
        <MobileNav />
        {/* Pages can set data-content-padding="false" to render full-bleed app layouts. */}
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
