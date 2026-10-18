/**
 * The public address of the app, for the sitemap and canonical links. APP_URL when set, otherwise Vercel's
 * production domain. Undefined locally, where there is nothing to point search engines at.
 */
export function siteUrl(): URL | undefined {
  const raw = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  try {
    return raw ? new URL(raw) : undefined;
  } catch {
    return undefined;
  }
}

/** The pages meant for search engines. Everything behind sign-in stays out. */
export const PUBLIC_PAGES = [
  "/",
  "/login",
  "/guides",
  "/guides/export-linkedin-connections",
  "/guides/build-a-networking-plan",
  "/guides/track-job-applications",
  "/privacy",
  "/terms",
] as const;

/** A canonical link for a public page, only when the site's address is known (a relative one is invalid). */
export function canonicalFor(path: (typeof PUBLIC_PAGES)[number]) {
  return siteUrl() ? { alternates: { canonical: path } } : {};
}
