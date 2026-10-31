/**
 * Whether following a link would take the person away from the page they are on. Used by the unsaved-changes guard, so it
 * must not ask about things that keep the page open: another site (it opens its own tab or the browser asks itself),
 * the same page, and downloads, which this app serves from `/api/...` routes with a file attachment.
 */
export function leavesPage(to: URL, here: { origin: string; pathname: string; search: string }): boolean {
  if (to.origin !== here.origin) return false;
  if (to.pathname.startsWith("/api/")) return false;
  if (to.pathname === here.pathname && to.search === here.search) return false;
  return true;
}
