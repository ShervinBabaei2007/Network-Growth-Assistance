/**
 * Saved views: a list's filters, as the URL's search string. Applying a view is just opening that URL, so links,
 * the back button and sharing all keep working. Pure, so the rules are unit-tested. No Zod: the browser uses it too.
 */

export const VIEW_PAGES = ["candidates", "people", "applications", "jobs"] as const;
export type ViewPage = (typeof VIEW_PAGES)[number];

/** The search parameters that make up a view, per page. Anything else (like `page`) is not part of it. */
const VIEW_KEYS: Record<ViewPage, readonly string[]> = {
  candidates: ["q", "status", "discipline", "university", "review", "size"],
  people: ["q", "status", "tag", "due", "size"],
  applications: ["view", "sort", "dir"],
  jobs: ["q", "where", "country", "range", "tab", "prov", "all", "level", "wp", "wpu", "type", "pay", "minpay", "company", "src", "unchecked"],
};

/** Keys that change how a list looks, not which rows it shows, so they are not counted as filters. */
const NOT_FILTERS: readonly string[] = ["size", "view", "sort", "dir"];

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_VIEWS_PER_USER = 30;
export const MAX_VIEW_NAME = 60;

export function parsePageSize(raw: string | null | undefined): number {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

/**
 * The canonical form of a search string for a page: only that page's keys, empty values dropped, values trimmed and
 * limited in length, keys in a fixed order. Two ways of writing the same filters give the same string.
 */
export function normalizeViewQuery(page: ViewPage, search: string | URLSearchParams): string {
  const params = typeof search === "string" ? new URLSearchParams(search.replace(/^\?/, "")) : search;
  const out = new URLSearchParams();
  for (const key of VIEW_KEYS[page]) {
    const value = (params.get(key) ?? "").trim().slice(0, 100);
    if (!value) continue;
    // The default page size is not a filter.
    if (key === "size" && Number(value) === DEFAULT_PAGE_SIZE) continue;
    if (key === "size" && !(PAGE_SIZES as readonly number[]).includes(Number(value))) continue;
    out.set(key, value);
  }
  return out.toString();
}

export function viewHref(page: ViewPage, query: string): string {
  return `/${page}${query ? `?${query}` : ""}`;
}

/** How many filters are applied (page size, layout and sort are not counted). */
export function activeFilterCount(page: ViewPage, search: string | URLSearchParams): number {
  const params = new URLSearchParams(normalizeViewQuery(page, search));
  for (const key of NOT_FILTERS) params.delete(key);
  return [...params.keys()].length;
}

export function isViewPage(value: unknown): value is ViewPage {
  return typeof value === "string" && (VIEW_PAGES as readonly string[]).includes(value);
}
