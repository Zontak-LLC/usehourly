// The security policy every page gets: the Content-Security-Policy and the other security headers. One source, three
// readers: src/proxy.ts (a nonce policy per request), next.config.mjs (the headers on each Worker response) and
// scripts/landing-static.mjs (the static landing page's `_headers`, which Cloudflare serves without the Worker).
// Plain JavaScript with JSDoc types, because next.config.mjs and the post-build script load it with plain Node.

/**
 * The Content-Security-Policy. Inline scripts never get 'unsafe-inline': a page rendered per request allows only
 * scripts carrying that request's nonce (src/proxy.ts), and the static landing page allows only the exact scripts it
 * holds, by hash (scripts/landing-static.mjs). An injected `<script>` or an `onclick=` attribute will not run.
 * Everything else is locked down too: no plugins, no <base> hijack, no framing, forms and fetches only to this
 * origin, images only from this origin or data/blob (logos are data URLs, downloads are blobs).
 *
 * @param {{ scriptSources: readonly string[]; isProd: boolean; upgradeToHttps: boolean }} options
 *   `scriptSources` are ready sources such as `'nonce-…'` or `'sha256-…'`.
 * @returns {string} the policy, directives joined by "; "
 */
export function buildCsp({ scriptSources, isProd, upgradeToHttps }) {
  return [
    "default-src 'self'",
    // The nonce or hashes cover Next.js's own inline scripts and the theme boot script. static.cloudflareinsights.com is
    // Cloudflare Web Analytics (injected at the edge in production); challenges.cloudflare.com is the sign-up robot check.
    `script-src 'self' ${scriptSources.join(" ")}${isProd ? " https://static.cloudflareinsights.com" : " 'unsafe-eval'"} https://challenges.cloudflare.com https://accounts.google.com`,
    // accounts.google.com is Google's sign-in script for "Connect Google Calendar" (issue #99), loaded when the Today calendar card is shown.
    // Turnstile draws its widget in an iframe from Cloudflare.
    "frame-src https://challenges.cloudflare.com",
    // Styles stay inline: React sets style attributes and Tailwind emits small inline blocks.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // api.anthropic.com and api.openai.com: "Polish" calls the AI service straight from the browser with the person's own key (issue #98).
    `connect-src 'self' https://api.anthropic.com https://api.openai.com https://accounts.google.com https://www.googleapis.com${isProd ? " https://cloudflareinsights.com" : " ws: wss:"}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Not on the browser tests' built copy (plain http on localhost): the browser would turn its own redirects into
    // https requests that nothing answers.
    ...(upgradeToHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/**
 * The security headers every page gets besides the CSP.
 *
 * @param {{ isStaging: boolean }} options `isStaging` is true on the staging copy (NEXT_PUBLIC_APP_ENV=staging)
 * @returns {{ key: string; value: string }[]}
 */
export function securityHeaders({ isStaging }) {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // The microphone is for this site's own pages only (Say it on the Log time card); frames and other origins stay blocked.
    { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    // The staging copy (npm run staging:deploy) must never be indexed.
    ...(isStaging ? [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] : []),
  ];
}
