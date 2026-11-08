import type { Metadata, Viewport } from "next";

import { APP_CONFIG } from "@/config/app-config";

/**
 * The share picture (src/app/opengraph-image.png and twitter-image.png, the same file, scripts/social/render.mjs).
 * Named here because the files sit at the app root, above both root layouts: Next.js would resolve them without this
 * `metadataBase` (as http://localhost:3000).
 */
const shareImage = (url: string) => ({
  url,
  type: "image/png",
  width: 2400,
  height: 1260,
  alt: "UseHourly: your timesheet, run by your AI assistant. A free, open source time tracker with a built-in MCP server for Claude, ChatGPT and Cursor.",
});

/** The metadata both root layouts share: `(landing)` for the static `/`, `(app)` for every other page. */
export const ROOT_METADATA: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3028"),
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
  openGraph: { images: [shareImage("/opengraph-image.png")] },
  twitter: {
    card: "summary_large_image",
    images: [shareImage("/twitter-image.png")],
  },
  appleWebApp: { capable: true, title: "UseHourly", statusBarStyle: "default" },
};

// viewport-fit=cover lets the page use the whole screen, so env(safe-area-inset-*) is real (the home bar under the
// bottom tab bar); the theme colour tints the browser bar to match the page.
export const ROOT_VIEWPORT: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // When the on-screen keyboard opens, resize the page (Chrome on Android) instead of covering it, so a dialog stays in view.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3ef" },
    { media: "(prefers-color-scheme: dark)", color: "#16181d" },
  ],
};
