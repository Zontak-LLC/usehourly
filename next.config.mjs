import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Expose Cloudflare bindings (D1) to `next dev`.
if (process.env.NODE_ENV === "development") {
  await initOpenNextCloudflareForDev();
}

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
