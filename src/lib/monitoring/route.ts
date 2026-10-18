/**
 * Turns a URL path into the route pattern monitoring records, so measurements group by page type and never contain
 * an id, a slug or anything else that could identify a person or their data. Pure and free of Node APIs, so the
 * browser can use it too.
 */

const ROOTS = new Set([
  "", "overview", "analytics", "applications", "candidates", "companies", "connections", "disciplines", "discover", "help", "jobs",
  "notifications", "people", "queue", "settings", "universities", "follow-ups", "login", "privacy", "terms", "guides", "auth",
]);

/** Fixed sub-pages under a root; any other second segment is a record's id or slug. */
const STATIC_CHILDREN = new Set(["import", "add", "employers", "resume", "searches", "reset"]);

const GUIDE_SLUGS = new Set(["export-linkedin-connections", "build-a-networking-plan", "track-job-applications"]);

export function normalizeRoute(path: string | null | undefined): string {
  const clean = (path ?? "").split(/[?#]/)[0]!.replace(/\/+$/, "");
  const parts = clean.split("/").filter(Boolean).slice(0, 3);
  const root = parts[0] ?? "";
  if (!ROOTS.has(root)) return "/other";
  if (parts.length === 0) return "/";
  const out = [root];
  if (parts[1] !== undefined) {
    if (STATIC_CHILDREN.has(parts[1]) || (root === "guides" && GUIDE_SLUGS.has(parts[1]))) out.push(parts[1]);
    else out.push(root === "companies" ? "[slug]" : "[id]");
  }
  // Anything deeper than a page and its record is folded into the record.
  return `/${out.join("/")}`;
}

/** A coarse device class from the user agent, the only thing taken from it. */
export function deviceFromUserAgent(ua: string | null | undefined): "phone" | "desktop" {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua ?? "") ? "phone" : "desktop";
}
