import { describe, expect, it } from "vitest";
import { activeFilterCount, normalizeViewQuery, parsePageSize, viewHref } from "./views";

describe("normalizeViewQuery", () => {
  it("keeps only the page's filters, in a fixed order, without empty values", () => {
    expect(normalizeViewQuery("candidates", "?university=u1&q=%20maya%20&status=&page=3&evil=1&review=1")).toBe("q=maya&university=u1&review=1");
  });
  it("gives the same string however the filters are written", () => {
    expect(normalizeViewQuery("candidates", "status=connected&q=x")).toBe(normalizeViewQuery("candidates", "q=x&status=connected"));
  });
  it("treats the default page size as no filter and drops unknown sizes", () => {
    expect(normalizeViewQuery("candidates", "size=50")).toBe("");
    expect(normalizeViewQuery("candidates", "size=100")).toBe("size=100");
    expect(normalizeViewQuery("candidates", "size=7")).toBe("");
  });
  it("limits long values", () => {
    expect(normalizeViewQuery("candidates", `q=${"a".repeat(500)}`)).toBe(`q=${"a".repeat(100)}`);
  });
});

describe("parsePageSize", () => {
  it("accepts only the offered sizes", () => {
    expect(parsePageSize("25")).toBe(25);
    expect(parsePageSize("100")).toBe(100);
    expect(parsePageSize("1000000")).toBe(50);
    expect(parsePageSize(null)).toBe(50);
  });
});

describe("activeFilterCount and viewHref", () => {
  it("counts filters but not the page size", () => {
    expect(activeFilterCount("candidates", "q=a&status=approved&size=100&page=2")).toBe(2);
    expect(activeFilterCount("candidates", "")).toBe(0);
  });
  it("builds a link", () => {
    expect(viewHref("candidates", "q=a")).toBe("/candidates?q=a");
    expect(viewHref("candidates", "")).toBe("/candidates");
  });
});

describe("views on other pages", () => {
  it("each page keeps only its own keys", () => {
    expect(normalizeViewQuery("people", "q=a&due=1&status=connected&review=1&page=2&size=25")).toBe("q=a&status=connected&due=1&size=25");
    expect(normalizeViewQuery("applications", "dir=desc&view=list&sort=company&q=ignored")).toBe("view=list&sort=company&dir=desc");
    expect(normalizeViewQuery("jobs", "q=dev&wp=remote&tab=saved&page=3&evil=1")).toBe("q=dev&tab=saved&wp=remote");
  });
  it("does not count layout or sort as filters", () => {
    expect(activeFilterCount("applications", "view=list&sort=title&dir=asc")).toBe(0);
    expect(activeFilterCount("people", "status=connected&due=1&size=100")).toBe(2);
  });
  it("builds links for each page", () => {
    expect(viewHref("applications", "view=list")).toBe("/applications?view=list");
    expect(viewHref("jobs", "")).toBe("/jobs");
  });
});
