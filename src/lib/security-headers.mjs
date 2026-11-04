// The security headers every page gets. One list, two readers: next.config.mjs sets them on each response the Worker
// sends, and scripts/landing-static.mjs writes them into `_headers` for the static landing page, which Cloudflare
// serves without the Worker. Plain JavaScript because next.config.mjs loads it with Node, before any build.

/**
 * @param {string | undefined} appEnv NEXT_PUBLIC_APP_ENV ("staging" on the staging copy)
 * @returns {{ key: string; value: string }[]}
 */
export function securityHeaders(appEnv) {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    // The staging copy (npm run staging:deploy) must never be indexed.
    ...(appEnv === "staging" ? [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] : []),
  ];
}
