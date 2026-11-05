import type { ReactNode } from "react";

import { ServiceWorkerRegister } from "@/components/service-worker";
import { TRPCProvider } from "@/components/trpc-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isStaging } from "@/lib/app-env";
import { fontVars } from "@/lib/fonts/registry";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { ThemeBootScript } from "@/scripts/theme-boot";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

import "@/app/globals.css";

/**
 * The `<html>` tree of every page, rendered by both root layouts. `(app)` passes the request's CSP nonce; `(landing)`
 * passes none, so `/` can be built once as a static file (its scripts are allowed by hash, scripts/landing-static.mjs).
 */
export function RootDocument({ nonce, children }: Readonly<{ nonce?: string; children: ReactNode }>) {
  const { theme_mode, content_layout, navbar_style, nav_position, sidebar_variant, sidebar_collapsible, font } =
    PREFERENCE_DEFAULTS;
  return (
    <html
      lang="en"
      data-theme-mode={theme_mode}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
      data-nav-position={nav_position}
      data-sidebar-variant={sidebar_variant}
      data-sidebar-collapsible={sidebar_collapsible}
      data-font={font}
      suppressHydrationWarning
    >
      <head>
        {/* Applies theme and layout preferences on load to avoid flicker and unnecessary server rerenders. */}
        <ThemeBootScript nonce={nonce} />
      </head>
      <body className={`${fontVars} min-h-dvh antialiased`}>
        {isStaging() && (
          <p role="note" className="bg-amber-200 px-3 py-1 text-center font-medium text-amber-950 text-xs">
            Staging copy: test data only. This is not the real site.
          </p>
        )}
        <TooltipProvider>
          <PreferencesStoreProvider initialValues={PREFERENCE_DEFAULTS}>
            <TRPCProvider>{children}</TRPCProvider>
            <ServiceWorkerRegister />
            <Toaster />
          </PreferencesStoreProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
