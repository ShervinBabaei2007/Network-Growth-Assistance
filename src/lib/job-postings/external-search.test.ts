import { describe, expect, it } from "vitest";
import { externalSearchLinks } from "./external-search";

describe("externalSearchLinks: the same search on other sites, opened by the user", () => {
  it("links to exactly LinkedIn, Indeed, Glassdoor and Google Jobs, with the words encoded", () => {
    const links = externalSearchLinks({ what: "UX & UI Designer", where: "Toronto", country: "CA" });
    expect(links.map((l) => l.site)).toEqual(["linkedin", "indeed", "glassdoor", "google"]);
    const [linkedin, indeed, glassdoor, google] = links.map((l) => new URL(l.url));
    expect(linkedin.hostname).toBe("www.linkedin.com");
    expect(linkedin.searchParams.get("keywords")).toBe("UX & UI Designer");
    expect(linkedin.searchParams.get("location")).toBe("Toronto, Canada");
    expect(indeed.hostname).toBe("ca.indeed.com");
    expect(Object.fromEntries(indeed.searchParams)).toEqual({ q: "UX & UI Designer", l: "Toronto" });
    expect(glassdoor.searchParams.get("sc.keyword")).toBe("UX & UI Designer");
    expect(google.hostname).toBe("www.google.com");
    expect(google.searchParams.get("q")).toBe("UX & UI Designer jobs Toronto, Canada");
    expect(google.searchParams.get("ibp")).toBe("htl;jobs");
    for (const l of links) expect(l.url).toMatch(/^https:\/\//);
  });

  it("uses each country's own Indeed site, or the main one with the country as the place", () => {
    expect(new URL(externalSearchLinks({ what: "Nurse", where: null, country: "GB" })[1].url).hostname).toBe("uk.indeed.com");
    const kenya = new URL(externalSearchLinks({ what: "Nurse", where: null, country: "KE" })[1].url);
    expect(kenya.hostname).toBe("www.indeed.com");
    expect(kenya.searchParams.get("l")).toBe("Kenya");
    expect(new URL(externalSearchLinks({ what: "Nurse", where: null, country: "US" })[1].url).hostname).toBe("www.indeed.com");
  });

  it("searches remote jobs for Anywhere, and offers nothing without search words", () => {
    expect(new URL(externalSearchLinks({ what: "Writer", where: null, country: "*" })[0].url).searchParams.get("location")).toBe("Remote");
    expect(externalSearchLinks({ what: "  ", where: "Paris", country: "FR" })).toEqual([]);
  });
});
