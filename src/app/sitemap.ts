import type { MetadataRoute } from "next";

import { GUIDE_PATHS } from "@/content/guide";

const SITE_URL = "https://usehourly.app";

// The public pages only: everything else needs a signed-in user.
const PUBLIC_ROUTES = [
  "/",
  "/auth/v2/login",
  "/auth/v2/register",
  "/privacy",
  "/terms",
  "/tools/hours-calculator",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return [...PUBLIC_ROUTES, ...GUIDE_PATHS].map((route) => ({
    url: `${SITE_URL}${route}`,
  }));
}
