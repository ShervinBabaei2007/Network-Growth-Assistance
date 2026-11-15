import { DEFAULT_PAGE_SIZE, parsePageSize, viewKeys, type ViewPage } from "./views";

/**
 * What every list page does with its URL: read a search parameter, work out the page and page size, turn the search box
 * into a PostgREST filter, and build the link to another page of the same filters. Pure, so each rule is unit-tested once
 * instead of being copied into every list.
 */

/** A search parameter's first value, or "". */
export const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

type Params = Record<string, string | string[] | undefined>;

/** The page number (1 or more) and the page size the URL asks for. */
export function pagingFrom(sp: Params): { page: number; pageSize: number } {
  return { page: Math.max(1, Number(one(sp.page)) || 1), pageSize: parsePageSize(one(sp.size)) };
}

/** The `.range()` bounds for a page. */
export const pageRange = (page: number, pageSize: number): [from: number, to: number] => [(page - 1) * pageSize, page * pageSize - 1];

export const pageCount = (total: number, pageSize: number): number => Math.max(1, Math.ceil(total / pageSize));

/** The search text with the characters that mean something in PostgREST filter syntax turned into spaces. */
export const searchTerm = (q: string): string => q.replace(/[,()*%\\"':.]/g, " ").trim();

/** The `.or()` filter that matches the search text in any of the columns, or null when there is nothing to search for. */
export function searchFilter(q: string, columns: readonly string[]): string | null {
  const term = searchTerm(q);
  return term ? columns.map((c) => `${c}.ilike.*${term}*`).join(",") : null;
}

/**
 * The link to a page of a list with these filters. Only the page's own saved-view keys are kept, in their fixed order,
 * so a list's links and its saved views cannot drift apart. A `true` filter is written as 1; the default page size and
 * page 1 are left out.
 */
export function listHref(page: ViewPage, filters: Record<string, string | number | boolean | null | undefined>, pageNumber = 1): string {
  const s = new URLSearchParams();
  for (const key of viewKeys(page)) {
    const v = filters[key];
    if (v === true) s.set(key, "1");
    else if (v !== false && v !== null && v !== undefined && v !== "" && !(key === "size" && Number(v) === DEFAULT_PAGE_SIZE)) s.set(key, String(v));
  }
  if (pageNumber > 1) s.set("page", String(pageNumber));
  return `/${page}${s.size ? `?${s}` : ""}`;
}

export { DEFAULT_PAGE_SIZE };
