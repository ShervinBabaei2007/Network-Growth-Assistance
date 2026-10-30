import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/components/app-nav";
import { activeTab, tabHrefs, TAB_HREFS } from "./mobile-tabs";

describe("tabHrefs", () => {
  it("gives three or four tabs for every goal, and treats an unset goal as both", () => {
    for (const hrefs of Object.values(TAB_HREFS)) expect(hrefs.length).toBeGreaterThanOrEqual(3);
    for (const hrefs of Object.values(TAB_HREFS)) expect(hrefs.length).toBeLessThanOrEqual(4);
    expect(tabHrefs(undefined)).toEqual(TAB_HREFS.both);
  });
  it("only points at pages the menu knows about", () => {
    const known = new Set(NAV_ITEMS.map((i) => i.href));
    for (const hrefs of Object.values(TAB_HREFS)) for (const h of hrefs) expect(known.has(h)).toBe(true);
  });
  it("only offers a goal what that goal's menu shows first", () => {
    for (const goal of ["network", "jobs", "both"] as const) {
      const primary = new Set(NAV_ITEMS.filter((i) => i.primaryFor.includes(goal)).map((i) => i.href));
      for (const h of TAB_HREFS[goal]) expect(primary.has(h)).toBe(true);
    }
  });
});

describe("activeTab", () => {
  const hrefs = ["/overview", "/jobs", "/applications"];
  it("matches the page and pages under it", () => {
    expect(activeTab("/jobs", hrefs)).toBe("/jobs");
    expect(activeTab("/jobs/123", hrefs)).toBe("/jobs");
  });
  it("matches nothing for a page that lives under More", () => {
    expect(activeTab("/settings", hrefs)).toBeNull();
    expect(activeTab(null, hrefs)).toBeNull();
  });
  it("does not treat a longer name as a child", () => {
    expect(activeTab("/jobsearch", hrefs)).toBeNull();
  });
});
