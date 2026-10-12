import { describe, expect, it } from "vitest";
import { jobPlace, wantedScope } from "./ats/types";
import { placeLabel } from "./labels";
import { locationScore } from "./rank";
import { AdzunaProvider } from "./providers/adzuna";
import { jobicyGeo, jobicyIndustry } from "./providers/jobicy";
import { RemotiveProvider, remotiveScope } from "./providers/remotive";

describe("jobPlace: jobs are kept for the countries people search", () => {
  const ca = wantedScope(["CA"]);
  const caDe = wantedScope(["CA", "DE"]);

  it("keeps a job in a searched country, with its country and every place it covers", () => {
    expect(jobPlace([{ text: "Berlin, Germany" }], false, caDe)).toMatchObject({ country: "DE", countries: ["DE"], city: "Berlin" });
    expect(jobPlace([{ text: "Berlin, Germany" }], false, ca)).toBeNull();
    expect(jobPlace([{ text: "New York, NY; Toronto, ON" }], false, ca)).toMatchObject({ country: "CA", province: "ON", countries: ["CA", "US"] });
  });

  it("keeps remote jobs open to a searched country's region or anywhere", () => {
    expect(jobPlace([{ text: "Remote - EMEA" }], true, caDe)).toMatchObject({ country: null, countries: ["emea"], remote: true });
    expect(jobPlace([{ text: "Remote - EMEA" }], true, ca)).toBeNull();
    expect(jobPlace([{ text: "Remote (Worldwide)" }], true, ca)).toMatchObject({ countries: ["*"] });
    // "Remote" alone says nothing about where: never assumed.
    expect(jobPlace([{ text: "Remote" }], true, caDe)).toBeNull();
  });
});

describe("Jobicy: any country, any field", () => {
  it("asks for the country's own location, else its region, else anywhere", () => {
    expect(jobicyGeo("CA")).toBe("canada");
    expect(jobicyGeo("GB")).toBe("uk");
    expect(jobicyGeo("IN")).toBe("apac");
    expect(jobicyGeo("NG")).toBe("emea");
    expect(jobicyGeo("CO")).toBe("latam");
    expect(jobicyGeo("*")).toBe("anywhere");
  });

  it("adds an industry only when the words clearly name a field", () => {
    expect(jobicyIndustry("UX Designer")).toBe("web-app-design");
    expect(jobicyIndustry("Graphic Designer")).toBe("design-multimedia");
    expect(jobicyIndustry("Customer Service Representative")).toBe("supporting");
    expect(jobicyIndustry("Registered Nurse")).toBe("healthcare");
    expect(jobicyIndustry("Bookkeeper")).toBe("accounting-finance");
    expect(jobicyIndustry("Barista")).toBeNull();
  });
});

describe("Remotive: worldwide scope", () => {
  const raw = (where: string) => ({
    id: 7,
    url: "https://remotive.com/remote-jobs/design/ux-designer-7",
    title: "UX Designer",
    company_name: "Acme",
    publication_date: "2026-10-08T21:47:32",
    candidate_required_location: where,
    description: "<p>Design flows in Figma.</p>",
  });

  it("reads where a job can be done and keeps it for any searched country", () => {
    expect(remotiveScope("USA, Canada, Mexico")).toEqual(["CA", "MX", "US"]);
    expect(remotiveScope("Europe")).toEqual(["europe"]);
    expect(remotiveScope("Worldwide")).toEqual(["*"]);
    const p = new RemotiveProvider();
    expect(p.normalizeJob(raw("Europe"), wantedScope(["DE"]))).toMatchObject({ countries: ["europe"] });
    expect(p.normalizeJob(raw("Europe"), wantedScope(["CA"]))).toBeNull();
    expect(p.normalizeJob(raw("Germany"), wantedScope(["DE"]))).toMatchObject({ country: "DE" });
  });
});

describe("Adzuna (optional): only the countries it covers", () => {
  it("doesn't call out for a country Adzuna doesn't serve", async () => {
    let called = false;
    const p = new AdzunaProvider("id", "key", async () => {
      called = true;
      return new Response("{}");
    });
    expect(await p.searchJobs({ what: "Nurse", country: "NG", where: null, maxDaysOld: 7, page: 1 }, AbortSignal.timeout(1000))).toMatchObject({ outcome: "empty", jobs: [] });
    expect(called).toBe(false);
  });
});

describe("labels and ranking outside Canada", () => {
  it("says where a job is, or who a remote job is open to", () => {
    expect(placeLabel({ city: "Berlin", province: null, remote: false, country: "DE", countries: ["DE"] })).toBe("Berlin, Germany");
    expect(placeLabel({ city: "Toronto", province: "ON", remote: false, country: "CA" })).toBe("Toronto, ON, Canada");
    expect(placeLabel({ city: null, province: null, remote: true, country: null, countries: ["europe", "GB"] })).toBe("Remote: open to Europe, United Kingdom");
    expect(placeLabel({ city: null, province: null, remote: true, country: null, countries: ["*"] })).toBe("Remote: open to anywhere");
    expect(placeLabel({ city: null, province: null, remote: true })).toBe("Remote");
  });

  it("ranks a job in the searched country above a remote one", () => {
    expect(locationScore({ province: null, remote: false, country: "DE" }, [], "DE")).toBe(1);
    expect(locationScore({ province: null, remote: true, country: null }, [], "DE")).toBe(0.8);
    expect(locationScore({ province: "BC", remote: false, country: "CA" }, ["BC", "ON"], "CA")).toBe(1);
  });
});
