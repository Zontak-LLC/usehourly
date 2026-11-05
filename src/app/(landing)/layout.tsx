import type { ReactNode } from "react";

import { RootDocument } from "@/components/root-document";
import { ROOT_METADATA, ROOT_VIEWPORT } from "@/lib/root-metadata";

export const metadata = ROOT_METADATA;
export const viewport = ROOT_VIEWPORT;

/**
 * The root layout of the landing page `/` alone: no `headers()` and no nonce, so `next build` makes it a static file.
 * Cloudflare serves that file before the Worker runs (no cold start); scripts/landing-static.mjs copies it into the
 * static assets and allows its inline scripts by hash.
 */
export default function LandingRootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <RootDocument>{children}</RootDocument>;
}
