import type { ReactNode } from "react";

import { headers } from "next/headers";

import { RootDocument } from "@/components/root-document";
import { ROOT_METADATA, ROOT_VIEWPORT } from "@/lib/root-metadata";

export const metadata = ROOT_METADATA;
export const viewport = ROOT_VIEWPORT;

/** The root layout of every page except the landing page `/` (that one is static, see `(landing)/layout.tsx`). */
export default async function AppRootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Reading the request's nonce (set in src/proxy.ts) is what makes pages render per request: the policy only
  // lets scripts carrying this request's nonce run. scripts/check-static-routes.mjs fails the build if a page here
  // becomes static anyway.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <RootDocument nonce={nonce}>{children}</RootDocument>;
}
