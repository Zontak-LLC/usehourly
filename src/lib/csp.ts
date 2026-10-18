/**
 * The Content-Security-Policy, built per request so that scripts need a one-time nonce instead of 'unsafe-inline'.
 * A script the page did not mark with this request's nonce (an injected `<script>` or an `onclick=` attribute) will
 * not run. Everything else is locked down too: no plugins, no <base> hijack, no framing, forms and fetches only to
 * this origin, images only from this origin or data/blob (logos are data URLs, downloads are blobs).
 */
export function buildCsp(nonce: string, isProd: boolean): string {
  return [
    "default-src 'self'",
    // The nonce covers Next.js's own inline scripts and the theme boot script. static.cloudflareinsights.com is
    // Cloudflare Web Analytics (injected at the edge in production); challenges.cloudflare.com is the sign-up robot check.
    `script-src 'self' 'nonce-${nonce}'${isProd ? " https://static.cloudflareinsights.com" : " 'unsafe-eval'"} https://challenges.cloudflare.com`,
    // Turnstile draws its widget in an iframe from Cloudflare.
    "frame-src https://challenges.cloudflare.com",
    // Styles stay inline: React sets style attributes and Tailwind emits small inline blocks.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isProd ? " https://cloudflareinsights.com" : " ws: wss:"}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** A fresh, unguessable nonce (base64 of 16 random bytes). */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
