import { describe, expect, it } from "vitest";
import { testCriteria } from "@/test/discovery";
import { htmlToText } from "./fetch-page";
import { draftFromGitHub, identityKeys, verifyExtraction, type Extraction } from "./extract";
import { FIXTURE_EXTRACTIONS, FIXTURE_PAGES } from "./fixtures";

const criteria = testCriteria("Find 50 UofT Computer Engineering software engineers");
const pageFor = (url: string) => ({ url, ...htmlToText(FIXTURE_PAGES[url], url) });

describe("verifyExtraction", () => {
  it("keeps quoted facts and drops a fact whose quote isn't on the page", () => {
    const url = "https://alexchen.example.dev/";
    const { people, dropped } = verifyExtraction(FIXTURE_EXTRACTIONS[url], pageFor(url), criteria);
    expect(people).toHaveLength(1);
    const alex = people[0];
    expect(alex.facts.map((f) => f.value)).not.toContain("Google");
    expect(dropped).toBeGreaterThanOrEqual(1);
    expect(alex.currentCompany).toBe("AMD");
    expect(alex.facts.find((f) => f.field === "grad_year")?.value).toBe("2023");
    // A personal page about the person: facts are high confidence.
    expect(alex.facts.every((f) => f.confidence === "high")).toBe(true);
    expect(alex.githubLogin).toBe("alexchen-dev");
    expect(alex.linkedinKey).toBe("alex-chen-fixture");
  });

  it("drops links the page doesn't contain", () => {
    const url = "https://robotics.example.org/team";
    const { people } = verifyExtraction(FIXTURE_EXTRACTIONS[url], pageFor(url), criteria);
    const priya = people.find((p) => p.fullName === "Priya Raman")!;
    expect(priya.linkedinUrl).toBeNull();
  });

  it("drops people whose name isn't on the page", () => {
    const url = "https://sampatel.example.io/about";
    const fake: Extraction = { people: [{ fullName: "Invented Person", headline: null, facts: [{ field: "company", value: "NVIDIA", quote: "Sam Patel is a software engineer at NVIDIA." }], githubUrl: null, websiteUrl: null, linkedinUrl: null }] };
    expect(verifyExtraction(fake, pageFor(url), criteria).people).toHaveLength(0);
  });

  it("rejects a value the quote doesn't contain", () => {
    const url = "https://sampatel.example.io/about";
    const fake: Extraction = { people: [{ fullName: "Sam Patel", headline: null, facts: [{ field: "company", value: "Google", quote: "Sam Patel is a software engineer at NVIDIA." }, { field: "grad_year", value: "2019", quote: "(class of 2021)" }], githubUrl: null, websiteUrl: null, linkedinUrl: null }] };
    const { people, dropped } = verifyExtraction(fake, pageFor(url), criteria);
    expect(people[0].facts).toHaveLength(0);
    expect(dropped).toBe(2);
  });

  it("missing facts stay missing", () => {
    const url = "https://robotics.example.org/team";
    const { people } = verifyExtraction(FIXTURE_EXTRACTIONS[url], pageFor(url), criteria);
    const priya = people.find((p) => p.fullName === "Priya Raman")!;
    expect(priya.currentCompany).toBeNull();
    expect(priya.location).toBeNull();
    expect(priya.facts.some((f) => f.field === "grad_year")).toBe(false);
  });
});

describe("draftFromGitHub", () => {
  const profile = { login: "Taylor-K", name: "Taylor Kim", bio: "UofT CompEng '24 | Software engineer @ Amazon", company: null, location: "Vancouver, BC", blog: "linkedin.com/in/taylor-kim", htmlUrl: "https://github.com/Taylor-K" };

  it("uses the profile's own words as evidence", () => {
    const d = draftFromGitHub(profile, criteria)!;
    expect(d.facts.find((f) => f.field === "institution")?.value).toBe("University of Toronto");
    expect(d.facts.find((f) => f.field === "program")?.value).toBe("Computer Engineering");
    expect(d.currentCompany).toBe("Amazon");
    expect(d.githubLogin).toBe("taylor-k");
    // A LinkedIn link the person published is kept as a link only.
    expect(d.linkedinKey).toBe("taylor-kim");
    expect(d.personalWebsite).toBeNull();
  });

  it("skips profiles without a real name or a mention of the school", () => {
    expect(draftFromGitHub({ ...profile, name: null }, criteria)).toBeNull();
    expect(draftFromGitHub({ ...profile, bio: "Engineer @ Amazon" }, criteria)).toBeNull();
  });

  it("doesn't treat the school as an employer", () => {
    const d = draftFromGitHub({ ...profile, company: "@UofT", bio: "Computer Engineering student" }, criteria)!;
    expect(d.facts.some((f) => f.field === "company")).toBe(false);
  });
});

describe("identityKeys", () => {
  it("collects strong signals but not shared hosts", () => {
    expect(identityKeys({ githubLogin: "a", linkedinKey: "b", personalWebsite: "https://www.alex.dev/x" })).toEqual(["github:a", "linkedin:b", "domain:alex.dev"]);
    expect(identityKeys({ githubLogin: null, linkedinKey: null, personalWebsite: "https://medium.com/@alex" })).toEqual([]);
  });
});
