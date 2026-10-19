import type { ReactNode } from "react";

import { headers } from "next/headers";

import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegister } from "@/components/service-worker";
import { TRPCProvider } from "@/components/trpc-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_CONFIG } from "@/config/app-config";
import { fontVars } from "@/lib/fonts/registry";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { ThemeBootScript } from "@/scripts/theme-boot";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3028"),
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
  twitter: {
    card: "summary_large_image",
  },
  appleWebApp: { capable: true, title: "UseHourly", statusBarStyle: "default" },
};

// viewport-fit=cover lets the page use the whole screen, so env(safe-area-inset-*) is real (the home bar under the
// bottom tab bar); the theme colour tints the browser bar to match the page.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdf7" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1712" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Reading the request's nonce (set in src/proxy.ts) is what makes pages render per request: the policy only
  // lets scripts carrying this request's nonce run.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const { theme_mode, theme_preset, content_layout, navbar_style, sidebar_variant, sidebar_collapsible, font } =
    PREFERENCE_DEFAULTS;
  return (
    <html
      lang="en"
      data-theme-mode={theme_mode}
      data-theme-preset={theme_preset}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
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
