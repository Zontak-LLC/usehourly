import type { MetadataRoute } from "next";

const SITE_URL = "https://usehourly.app";

// The public pages only: everything else needs a signed-in user.
const PUBLIC_ROUTES = [
  "/",
  "/auth/v2/login",
  "/auth/v2/register",
  "/help",
  "/privacy",
  "/terms",
  "/tools/hours-calculator",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
  }));
}
