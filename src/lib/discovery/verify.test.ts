import { describe, expect, it } from "vitest";
import { evaluateCriteria, type Fact } from "./evidence";
import { FIXTURE_READMES } from "./fixtures";
import { linkedInSearchUrl } from "./linkedin-link";
import { parseRequestDeterministic, statusFromText } from "./parse-request";
import { decideTier } from "./score";
import { factsFromOwnPage, gradYearIn, linksInMarkdown, markdownToText, ownLinkedIn } from "./verify";

const criteria = parseRequestDeterministic("Find 20 UofT Computer Engineering alumni working as software engineers");

describe("factsFromOwnPage", () => {
  it("reads a profile README line by line, quoting each line", () => {
    const md = FIXTURE_READMES["alexchen-dev"];
    const facts = factsFromOwnPage({ url: "https://github.com/alexchen-dev/alexchen-dev", title: "README", text: markdownToText(md) }, { fullName: "Alex Chen" }, criteria, { personal: true });
    expect(facts.map((f) => [f.field, f.value])).toEqual([
      ["role", "Backend Engineer"],
      ["company", "AMD"],
      ["institution", "University of Toronto"],
      ["program", "Computer Engineering"],
      ["grad_year", "2023"],
    ]);
    expect(facts.find((f) => f.field === "company")?.extractedText).toBe("💼 Backend Engineer at AMD, working on GPU driver tooling");
  });

  it("on someone else's page, only lines naming the person count", () => {
    const page = { url: "https://team.example.org", title: "Team", text: "Jordan Lee — Software Engineer at Shopify\nPriya Raman — University of Toronto, Computer Engineering" };
    const facts = factsFromOwnPage(page, { fullName: "Jordan Lee" }, criteria, { personal: false });
    expect(facts.map((f) => f.field)).toEqual(["role", "company"]);
  });

  it("doesn't take the school as an employer", () => {
    const facts = factsFromOwnPage({ url: "u", title: "", text: "Software engineer at University of Toronto" }, { fullName: "A B" }, criteria, { personal: true });
    expect(facts.some((f) => f.field === "company")).toBe(false);
  });
});

describe("helpers", () => {
  it.each([
    ["Computer Engineering 2T4", 2024],
    ["UofT CompEng '22", 2022],
    ["BASc 2019 – 2023", 2023],
    ["Computer Engineering", null],
  ])("gradYearIn(%s) = %s", (line, year) => {
    expect(gradYearIn(line)).toBe(year);
  });

  it("takes a LinkedIn link only when exactly one profile is linked", () => {
    expect(ownLinkedIn(["https://ca.linkedin.com/in/Alex-Chen/?x=1", "https://github.com/a"])).toEqual({ key: "alex-chen", url: "https://www.linkedin.com/in/alex-chen" });
    expect(ownLinkedIn(["https://linkedin.com/in/a", "https://linkedin.com/in/b"])).toBeNull();
    expect(ownLinkedIn(["https://linkedin.com/company/amd"])).toBeNull();
  });

  it("finds links in Markdown", () => {
    expect(linksInMarkdown(FIXTURE_READMES["alexchen-dev"])).toContain("https://www.linkedin.com/in/alex-chen-fixture");
  });

  it("builds a LinkedIn people search with the name and employer or school", () => {
    expect(linkedInSearchUrl({ fullName: "Alex Chen", currentCompany: "AMD", institution: "University of Toronto" })).toBe("https://www.linkedin.com/search/results/people/?keywords=Alex%20Chen%20AMD");
    expect(linkedInSearchUrl({ fullName: "Alex Chen", institution: "University of Toronto" })).toBe("https://www.linkedin.com/search/results/people/?keywords=Alex%20Chen%20University%20of%20Toronto");
  });
});

const fact = (field: Fact["field"], value: string, sourceUrl: string, confidence: Fact["confidence"] = "high"): Fact => ({ field, value, extractedText: value, confidence, sourceUrl, sourceTitle: null });

describe("stricter verification", () => {
  it("two independent sources upgrade a medium fact to high", () => {
    const one = evaluateCriteria([fact("role", "Software Engineer", "https://a", "medium")], criteria);
    expect(one.role.confidence).toBe("medium");
    const two = evaluateCriteria([fact("role", "Software Engineer", "https://a", "medium"), fact("role", "software engineer", "https://b", "medium")], criteria);
    expect(two.role.confidence).toBe("high");
    expect(two.role.note).toMatch(/2 independent sources/);
  });

  it("ECE is never upgraded to Computer Engineering by repetition", () => {
    const e = evaluateCriteria([fact("program", "Electrical and Computer Engineering", "https://a"), fact("program", "Electrical and Computer Engineering", "https://b")], criteria);
    expect(e.program.confidence).toBe("medium");
  });

  it("asking for alumni doesn't verify current students", () => {
    const today = new Date(2026, 9, 10);
    const base = [fact("institution", "University of Toronto", "https://a"), fact("program", "Computer Engineering", "https://a"), fact("role", "Software Engineer", "https://a"), fact("location", "Toronto", "https://a")];
    const student = evaluateCriteria([...base, fact("grad_year", "2028", "https://a")], criteria, today);
    expect(decideTier(student)).toEqual({ tier: "possible", reason: "Still studying (expected to graduate in 2028)" });
    expect(decideTier(evaluateCriteria([...base, fact("grad_year", "2024", "https://a")], criteria, today)).tier).toBe("verified");
    // Unknown year: no penalty.
    expect(decideTier(evaluateCriteria(base, criteria, today)).tier).toBe("verified");
  });

  it("reads alumni / student wording", () => {
    expect(statusFromText(" find uoft ce alumni ")).toBe("alumni");
    expect(statusFromText(" uoft ce graduates ")).toBe("alumni");
    expect(statusFromText(" uoft ce students ")).toBe("student");
    expect(statusFromText(" uoft ce students alumni ")).toBe("any");
    expect(statusFromText(" uoft ce people ")).toBe("any");
  });
});

describe("location lines", () => {
  it("reads where people say they're based", () => {
    const text = "📍 Based in Vancouver, BC\nI love hiking.\nLocation: Seattle, WA\nBased in my own little world";
    const facts = factsFromOwnPage({ url: "u", title: "", text }, { fullName: "A B" }, criteria, { personal: true });
    expect(facts.filter((f) => f.field === "location").map((f) => f.value)).toEqual(["Vancouver, BC", "Seattle, WA"]);
  });
});
