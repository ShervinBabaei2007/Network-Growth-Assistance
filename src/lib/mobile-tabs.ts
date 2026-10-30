import type { Goal } from "@/lib/onboarding/steps";

/**
 * The destinations on the phone's bottom tab bar, by goal. Three or four places a person returns to many times a
 * day; everything else stays in the menu behind the last tab ("More"), which opens the same menu as the header button.
 * An unset goal is treated as "both", like the sidebar.
 */
export const TAB_HREFS: Record<Goal, readonly string[]> = {
  network: ["/overview", "/queue", "/candidates", "/people"],
  jobs: ["/overview", "/jobs", "/applications"],
  both: ["/overview", "/queue", "/jobs", "/applications"],
};

export function tabHrefs(goal: Goal | undefined): readonly string[] {
  return TAB_HREFS[goal ?? "both"];
}

/** The tab for the page being viewed: the longest tab path that the current path equals or sits under. */
export function activeTab(pathname: string | null, hrefs: readonly string[]): string | null {
  if (!pathname) return null;
  const hits = hrefs.filter((h) => pathname === h || pathname.startsWith(`${h}/`));
  return hits.sort((a, b) => b.length - a.length)[0] ?? null;
}
