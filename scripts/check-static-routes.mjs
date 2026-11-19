// Runs after `next build` (npm run build): fails when a route other than the landing page `/` and the files below was
// built as static. Every page except `/` must render per request, because its inline scripts are allowed by the
// request's CSP nonce (src/proxy.ts): a static page has no nonce, so in the browser it would not hydrate.
// `/` is static on purpose (src/app/(landing)/layout.tsx, scripts/landing-static.mjs).
//
//   node scripts/check-static-routes.mjs        (reads NEXT_DIST_DIR, default .next)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The routes allowed to be static: the landing page, and what was already static before it (recorded from a real
 * `next build` on 2026-11-04): metadata files with no scripts, and Next.js's own global-error page. `/_not-found` is
 * not on the list: src/app/global-not-found.tsx reads the proxy's nonce, so a static 404 would not hydrate.
 */
export const STATIC_ALLOWED = new Set([
  "/",
  "/_global-error",
  "/apple-icon.png",
  "/favicon.ico",
  "/icon.svg",
  "/manifest.webmanifest",
  "/opengraph-image.png",
  "/robots.txt",
  "/sitemap.xml",
  "/twitter-image.png",
]);

/** The static routes in a `prerender-manifest.json` that are not allowed to be static. */
export function unexpectedStaticRoutes(manifest) {
  return Object.keys(manifest?.routes ?? {}).filter((route) => !STATIC_ALLOWED.has(route));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = join(process.env.NEXT_DIST_DIR || ".next", "prerender-manifest.json");
  const wrong = unexpectedStaticRoutes(JSON.parse(readFileSync(file, "utf8")));
  if (wrong.length > 0) {
    console.error(
      `Static by mistake: ${wrong.join(", ")}. Only / may be static; a page under src/app/(main) must read headers() ` +
        "(its root layout does) so it gets the CSP nonce. A new static metadata file goes in STATIC_ALLOWED.",
    );
    process.exit(1);
  }
  console.log("Static routes checked: only / and the allowed metadata files are static.");
}
