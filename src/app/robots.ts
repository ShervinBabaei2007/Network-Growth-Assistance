import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteUrl } from "@/lib/site";

// Search engines may read the sign-in page and the legal pages. Everything behind sign-in is blocked.
export default function robots(): MetadataRoute.Robots {
  const site = siteUrl();
  return {
    rules: { userAgent: "*", allow: [...PUBLIC_PAGES], disallow: "/" },
    ...(site ? { sitemap: new URL("/sitemap.xml", site).toString() } : {}),
  };
}
