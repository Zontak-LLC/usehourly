import type { MetadataRoute } from "next";

/** Lets phones "Add to Home Screen" and open UseHourly like an app (no browser bars). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UseHourly",
    short_name: "UseHourly",
    description: "Free time tracking for freelancers. Log your hours in seconds.",
    start_url: "/dashboard/today",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111111",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
