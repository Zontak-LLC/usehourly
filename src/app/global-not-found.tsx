import { headers } from "next/headers";

import NotFound from "@/app/(main)/not-found";
import { RootDocument } from "@/components/root-document";
import { ROOT_METADATA } from "@/lib/root-metadata";

export const metadata = ROOT_METADATA;

/**
 * The 404 for an address no route matches. With two root layouts there is no shared layout to wrap it, so it renders
 * its own document. Unmatched addresses still pass through src/proxy.ts, which sets a nonce policy, so it reads that
 * nonce like `(main)/layout.tsx` does; without it the theme boot script would be blocked.
 */
export default async function GlobalNotFound() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <RootDocument nonce={nonce}>
      <NotFound />
    </RootDocument>
  );
}
