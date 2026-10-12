import { describe, expect, it } from "vitest";
import { provinceOf } from "@/lib/discovery/location";
import { parseRange, rangeSince, titleQuery } from "./feed";
import { jobSource, siteName } from "./source";
import { dedupeKey, isFresh } from "./normalize";
import { byPriority } from "./regions";

const NOW = Date.parse("2026-10-11T18:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

describe("isFresh", () => {
  it("keeps the last 24 hours only", () => {
    expect(isFresh(hoursAgo(1), NOW)).toBe(true);
    expect(isFresh(hoursAgo(23.9), NOW)).toBe(true);
    expect(isFresh(hoursAgo(24.1), NOW)).toBe(false);
  });
  it("never treats a missing, unreadable or far-future date as fresh", () => {
    expect(isFresh(null, NOW)).toBe(false);
    expect(isFresh("yesterday", NOW)).toBe(false);
    expect(isFresh(hoursAgo(-2), NOW)).toBe(false);
  });
});

describe("provinceOf", () => {
  it("reads codes, names and unambiguous cities", () => {
    expect(provinceOf("BC")).toBe("BC");
    expect(provinceOf("British Columbia")).toBe("BC");
    expect(provinceOf(null, "Toronto")).toBe("ON");
    expect(provinceOf("Burnaby, BC")).toBe("BC");
    expect(provinceOf("Kitchener-Waterloo")).toBe("ON");
  });
  it("needs a qualifier for shared city names", () => {
    expect(provinceOf("Victoria")).toBeNull();
    expect(provinceOf("Victoria, BC")).toBe("BC");
    expect(provinceOf("Richmond, BC")).toBe("BC");
    expect(provinceOf("London")).toBeNull();
  });
  it("rejects places outside Canada", () => {
    expect(provinceOf("Vancouver, WA")).toBeNull();
    expect(provinceOf("Seattle")).toBeNull();
    expect(provinceOf("Victoria, Australia")).toBeNull();
  });
});

describe("dedupeKey", () => {
  it("keys pasted jobs by company, title and city", () => {
    const a = dedupeKey({ title: "Developer", company: "Acme Inc", city: "Vancouver", province: "BC", remote: false });
    expect(dedupeKey({ title: "Developer - Vancouver", company: "acme inc", city: "Vancouver", province: "BC", remote: false })).toBe(a);
    expect(dedupeKey({ title: "Developer", company: "Acme Inc", city: "Toronto", province: "ON", remote: false })).not.toBe(a);
  });
});

describe("feed", () => {
  it("orders provinces BC first, then Ontario", () => {
    expect(byPriority(["ON", "AB", "BC"])).toEqual(["BC", "ON", "AB"]);
  });

  it("builds a title search where developer also finds engineer and programmer (seniority words not required)", () => {
    expect(titleQuery(["Junior Software Developer"])).toBe("(software:A & (developer:A | engineer:A | programmer:A))");
    expect(titleQuery([])).toBeNull();
    expect(titleQuery(["C++ / Firmware!"])).toBe("(firmware:A)");
  });

  it("also finds close variants of a title, but not broader ones", () => {
    const q = titleQuery(["Full Stack Developer"])!;
    expect(q).toContain("(full:A & stack:A & (developer:A | engineer:A | programmer:A))");
    expect(q).toContain("(fullstack:A & (developer:A | engineer:A | programmer:A))");
    expect(q).toContain("(web:A & application:A & (developer:A | engineer:A | programmer:A))");
    expect(q).not.toContain("(software:A & (developer");
  });
});

describe("time ranges", () => {
  it("offers 24 hours, 3, 7, 14 and 30 days, and nothing chosen means automatic", () => {
    expect(parseRange(undefined)).toBeNull();
    expect(parseRange("nonsense")).toBeNull();
    expect(["1d", "3d", "7d", "14d", "30d"].map((k) => parseRange(k)!.hours)).toEqual([24, 72, 168, 336, 720]);
    expect(rangeSince(parseRange("7d")!, NOW)).toBe(new Date(NOW - 7 * 24 * 3600_000).toISOString());
  });
});

describe("job source", () => {
  it("names the employer's board and its system for crawled jobs", () => {
    expect(jobSource({ user_id: null, apply_url: "https://boards.greenhouse.io/acme/jobs/1" }, { name: "Acme", ats: "greenhouse" })).toEqual({
      kind: "board",
      label: "Greenhouse",
      detail: "Acme's job board",
    });
    expect(jobSource({ user_id: null, apply_url: "https://x.example" }, { name: "Northwind Labs", ats: "lever" }).detail).toBe("Northwind Labs' job board");
  });
  it("names the site a pasted posting came from", () => {
    expect(jobSource({ user_id: "u1", apply_url: "https://www.linkedin.com/jobs/view/123" }, null)).toMatchObject({ kind: "pasted", label: "LinkedIn" });
    expect(siteName("https://ca.indeed.com/viewjob?jk=1")).toBe("Indeed");
    expect(siteName("https://www.glassdoor.ca/job-listing/x")).toBe("Glassdoor");
    expect(siteName("https://careers.acme.ca/jobs/1")).toBe("careers.acme.ca");
    expect(siteName("not a url")).toBe("a website");
  });
});
