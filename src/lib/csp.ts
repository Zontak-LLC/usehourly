/**
 * The Content-Security-Policy, built per request so that scripts need a one-time nonce instead of 'unsafe-inline'.
 * A script the page did not mark with this request's nonce (an injected `<script>` or an `onclick=` attribute) will
 * not run. Everything else is locked down too: no plugins, no <base> hijack, no framing, forms and fetches only to
 * this origin, images only from this origin or data/blob (logos are data URLs, downloads are blobs).
 */
export function buildCsp(nonce: string, isProd: boolean, upgradeToHttps = isProd): string {
  return [
    "default-src 'self'",
    // The nonce covers Next.js's own inline scripts and the theme boot script. static.cloudflareinsights.com is
    // Cloudflare Web Analytics (injected at the edge in production); challenges.cloudflare.com is the sign-up robot check.
    `script-src 'self' 'nonce-${nonce}'${isProd ? " https://static.cloudflareinsights.com" : " 'unsafe-eval'"} https://challenges.cloudflare.com https://accounts.google.com`,
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

/** A fresh, unguessable nonce (base64 of 16 random bytes). */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
