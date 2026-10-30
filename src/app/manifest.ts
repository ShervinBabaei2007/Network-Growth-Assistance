import type { MetadataRoute } from "next";

/** Lets the app be installed to a phone's home screen and opened without browser chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Network Growth Assistant",
    short_name: "Network Growth",
    description: "Plan, prioritize and track your professional networking and job search.",
    start_url: "/overview",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2a78d6",
    icons: [
      { src: "/pwa-icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512&maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
