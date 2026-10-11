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
    removeConsole: process.env.NODE_ENV === "production",
  },
  async redirects() {
    return [
      { source: "/", destination: "/dashboard/today", permanent: false },
      { source: "/dashboard", destination: "/dashboard/today", permanent: false },
    ];
  },
};

export default nextConfig;
