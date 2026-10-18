import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Every page may be crawled. Nothing behind sign-in is exposed by that: a visitor or bot that isn't signed in is
// redirected to /login (see src/proxy.ts), so the only content a crawler ever receives is the public pages.
export default function robots(): MetadataRoute.Robots {
  const site = siteUrl();
  return {
    rules: { userAgent: "*", allow: "/" },
    ...(site ? { sitemap: new URL("/sitemap.xml", site).toString() } : {}),
  };
}
