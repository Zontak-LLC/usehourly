import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Expose Cloudflare bindings (D1) to `next dev`.
if (process.env.NODE_ENV === "development") {
  await initOpenNextCloudflareForDev();
}

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy. Inline scripts stay allowed because Next.js and the theme boot script
// emit them (a nonce-based policy would make every page dynamic); the rest is locked down: no
// plugins, no <base> hijack, no framing, forms and fetches only to this origin, images only from
// this origin or data/blob (logos are data URLs, downloads are blobs).
const csp = [
  "default-src 'self'",
  // static.cloudflareinsights.com: Cloudflare Web Analytics, injected at the edge in production.
  `script-src 'self' 'unsafe-inline'${isProd ? " https://static.cloudflareinsights.com" : " 'unsafe-eval'"}`,
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // Keep Prisma external so workerd resolves the bare specifier OpenNext bundles.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  compiler: {
    // Strip console.log in production but keep console.error: it is how server errors (the tRPC
    // route logs INTERNAL_SERVER_ERROR) reach the Worker logs.
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // "/" is the public landing page; src/proxy.ts sends signed-in users on to their day.
      { source: "/dashboard", destination: "/dashboard/today", permanent: false },
    ];
  },
};

export default nextConfig;
