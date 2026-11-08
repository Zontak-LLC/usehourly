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
 * Next.js's built-in fallback, static since there is no app-wide root layout; nothing reaches it, because
 * `(app)/[...missing]` answers every unknown address with the (app) 404 and its nonce.
 */
export const STATIC_ALLOWED = new Set([
  "/",
  "/_global-error",
  "/_not-found",
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
      `Static by mistake: ${wrong.join(", ")}. Only / may be static; a page under src/app/(app) must read headers() ` +
        "(its root layout does) so it gets the CSP nonce. A new static metadata file goes in STATIC_ALLOWED.",
    );
    process.exit(1);
  }
  console.log("Static routes checked: only / and the allowed metadata files are static.");
}
