import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Expose Cloudflare bindings (D1) to `next dev`.
if (process.env.NODE_ENV === "development") {
  await initOpenNextCloudflareForDev();
}

// The Content-Security-Policy is built per request (a fresh nonce for scripts) in src/proxy.ts; see src/lib/csp.ts.

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Browser tests build into their own folder so they can run beside the normal dev server (NEXT_DIST_DIR=.next-e2e).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Development only: lets a second browser session on 127.0.0.1 (separate cookies from localhost) load the app's scripts.
  allowedDevOrigins: ["127.0.0.1"],
  reactCompiler: true,
  // Do not announce the framework in an X-Powered-By header.
  poweredByHeader: false,
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
