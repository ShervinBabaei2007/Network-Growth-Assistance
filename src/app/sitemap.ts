import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = siteUrl();
  if (!site) return [];
  return PUBLIC_PAGES.map((path) => ({ url: new URL(path, site).toString() }));
}
