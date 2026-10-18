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
