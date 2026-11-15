import { describe, expect, it } from "vitest";
import { listHref, one, pageCount, pageRange, pagingFrom, searchFilter, searchTerm } from "./list-view";
import { normalizeViewQuery, VIEW_PAGES, viewKeys } from "./views";

describe("reading the URL", () => {
  it("takes the first value of a repeated parameter and treats a missing one as empty", () => {
    expect(one(["a", "b"])).toBe("a");
    expect(one("x")).toBe("x");
    expect(one(undefined)).toBe("");
    expect(one([])).toBe("");
  });

  it("works out the page and the page size", () => {
    expect(pagingFrom({})).toEqual({ page: 1, pageSize: 50 });
    expect(pagingFrom({ page: "3", size: "100" })).toEqual({ page: 3, pageSize: 100 });
    expect(pagingFrom({ page: ["2", "9"], size: ["25"] })).toEqual({ page: 2, pageSize: 25 });
  });

  it("never gives a page below 1 or a page size that is not offered", () => {
    expect(pagingFrom({ page: "0", size: "7" })).toEqual({ page: 1, pageSize: 50 });
    expect(pagingFrom({ page: "-4" }).page).toBe(1);
    expect(pagingFrom({ page: "abc" }).page).toBe(1);
  });

  it("gives the range bounds and page count for a page", () => {
    expect(pageRange(1, 50)).toEqual([0, 49]);
    expect(pageRange(3, 25)).toEqual([50, 74]);
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
  });
});

describe("search text", () => {
  it("turns characters that mean something in a PostgREST filter into spaces", () => {
    expect(searchTerm(`a,b(c)*d%e\\f"g'h:i.j`)).toBe("a b c  d e f g h i j");
    expect(searchTerm("  plain text ")).toBe("plain text");
  });

  it("builds one ilike filter across the columns, or none when there is nothing to search for", () => {
    expect(searchFilter("ada", ["full_name", "role"])).toBe("full_name.ilike.*ada*,role.ilike.*ada*");
    expect(searchFilter("   ", ["full_name"])).toBeNull();
    expect(searchFilter(",,()", ["full_name"])).toBeNull();
  });

  it("cannot inject a filter through the search box", () => {
    const f = searchFilter("x),status.eq.approved,(y", ["full_name"])!;
    expect(f.split(",")).toHaveLength(1);
    expect(f).not.toMatch(/[()]/);
  });
});

describe("links to a page of a list", () => {
  it("leaves out empty filters, false, the default page size and page 1", () => {
    expect(listHref("people", { q: "", status: "", tag: "", due: false, size: 50 })).toBe("/people");
    expect(listHref("candidates", {})).toBe("/candidates");
  });

  it("writes filters in the saved-view order, then the page", () => {
    expect(listHref("people", { size: 100, due: true, tag: "vip", status: "replied", q: "ada" }, 3)).toBe("/people?q=ada&status=replied&tag=vip&due=1&size=100&page=3");
    expect(listHref("candidates", { review: true, university: "ubc", discipline: "cs", status: "approved", q: "x" }, 2)).toBe("/candidates?q=x&status=approved&discipline=cs&university=ubc&review=1&page=2");
  });

  it("keeps search text longer than a saved view would, so a next-page link searches what the box shows", () => {
    const q = "a".repeat(150);
    expect(new URL(listHref("people", { q }, 2), "http://x").searchParams.get("q")).toBe(q);
  });

  it("drops any key that is not one of the page's saved-view keys", () => {
    expect(listHref("people", { q: "a", nonsense: "b" })).toBe("/people?q=a");
  });

  it("is the same string a saved view would hold for the same filters (page aside)", () => {
    for (const page of VIEW_PAGES) {
      const filters = Object.fromEntries(viewKeys(page).map((k) => [k, k === "size" ? 100 : "v"]));
      const href = new URL(listHref(page, filters), "http://x");
      expect(href.search.slice(1)).toBe(normalizeViewQuery(page, new URLSearchParams(Object.entries(filters).map(([k, v]) => [k, String(v)]))));
    }
  });
});
