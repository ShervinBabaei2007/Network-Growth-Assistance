import { describe, expect, it } from "vitest";
import { evaluateCriteria, type Fact } from "./evidence";
import { parseRequestDeterministic } from "./parse-request";
import { decideTier, scorePerson } from "./score";

const fact = (field: Fact["field"], value: string, extractedText = value, confidence: Fact["confidence"] = "high", sourceUrl = "https://a.dev"): Fact => ({ field, value, extractedText, confidence, sourceUrl, sourceTitle: null });

const criteria = parseRequestDeterministic("Find 50 UofT Computer Engineering software engineers in Toronto");

describe("evaluateCriteria", () => {
  it("credits each criterion only with matching facts", () => {
    const e = evaluateCriteria([fact("institution", "University of Toronto"), fact("program", "Computer Engineering"), fact("role", "Backend Engineer"), fact("location", "Toronto, ON")], criteria);
    expect(e.institution.confidence).toBe("high");
    expect(e.program.confidence).toBe("high");
    expect(e.role.confidence).toBe("high");
    expect(e.location.confidence).toBe("high");
    expect(e.company.requested).toBe(false);
  });

  it("treats ECE as weaker evidence for Computer Engineering", () => {
    const e = evaluateCriteria([fact("program", "Electrical and Computer Engineering")], criteria);
    expect(e.program.confidence).toBe("medium");
    expect(e.program.note).toMatch(/not confirmed/);
  });

  it("a known school's short form counts fully; an unvetted acronym is medium confidence", () => {
    expect(evaluateCriteria([fact("institution", "UofT", "UofT CompEng")], criteria).institution.confidence).toBe("high");
    const mit = { ...criteria, education: { ...criteria.education, institution: "Massachusetts Institute of Technology", institutionAliases: ["MIT"] } };
    expect(evaluateCriteria([fact("institution", "MIT", "MIT EECS")], mit).institution.confidence).toBe("medium");
  });

  it("unknown stays unknown", () => {
    const e = evaluateCriteria([], criteria);
    expect(e.institution.confidence).toBeNull();
    expect(e.gradYear.requested).toBe(false);
  });
});

describe("scorePerson", () => {
  const strong = [fact("institution", "University of Toronto"), fact("program", "Computer Engineering"), fact("role", "Software Engineer"), fact("location", "Toronto"), fact("company", "AMD", "AMD", "high", "https://b.dev")];

  it("explains every point and reaches ~100 with strong evidence", () => {
    const s = scorePerson(evaluateCriteria(strong, criteria), strong);
    expect(s.relevance).toBeGreaterThanOrEqual(95);
    expect(s.breakdown.reduce((a, l) => a + l.points, 0)).toBe(s.relevance);
    expect(s.breakdown.map((l) => l.label)).toEqual(["Education", "Program", "Career", "Location", "Evidence"]);
    expect(s.tier).toBe("verified");
    expect(s.reasons).toContain("✓ University of Toronto");
  });

  it("ranks weak evidence below strong evidence", () => {
    const weak = strong.map((f) => ({ ...f, confidence: "medium" as const }));
    const a = scorePerson(evaluateCriteria(strong, criteria), strong);
    const b = scorePerson(evaluateCriteria(weak, criteria), weak);
    expect(b.relevance).toBeLessThan(a.relevance);
    expect(b.tier).toBe("possible");
  });

  it("rejects people without a verified school or program", () => {
    expect(decideTier(evaluateCriteria([fact("program", "Computer Engineering")], criteria)).tier).toBe("rejected");
    expect(decideTier(evaluateCriteria([fact("institution", "University of Toronto")], criteria)).tier).toBe("rejected");
  });

  it("applies feedback", () => {
    const s = scorePerson(evaluateCriteria(strong, criteria), strong, undefined, { excluded: true, bonus: 0, note: "Not relevant" });
    expect(s.tier).toBe("rejected");
    expect(s.relevance).toBeLessThanOrEqual(40);
    const bonus = scorePerson(evaluateCriteria(strong.slice(0, 3), criteria), strong.slice(0, 3), undefined, { excluded: false, bonus: 3 });
    expect(bonus.relevance).toBe(scorePerson(evaluateCriteria(strong.slice(0, 3), criteria), strong.slice(0, 3)).relevance + 3);
  });

  it("rejects a known employer outside the requested list", () => {
    const c = parseRequestDeterministic("UofT Computer Engineering grads at NVIDIA or AMD");
    const facts = [fact("institution", "University of Toronto"), fact("program", "Computer Engineering"), fact("company", "Shopify")];
    expect(decideTier(evaluateCriteria(facts, c)).tier).toBe("rejected");
    expect(decideTier(evaluateCriteria([...facts.slice(0, 2), fact("company", "AMD"), fact("location", "Toronto, ON")], c)).tier).toBe("verified");
  });
});

describe("located in Canada only", () => {
  const c = parseRequestDeterministic("Find UofT Computer Engineering software engineers");
  const base = [fact("institution", "University of Toronto"), fact("program", "Computer Engineering"), fact("role", "Software Engineer")];

  it("searches are limited to Canada by default", () => {
    expect(c.country).toBe("Canada");
  });

  it("verifies people located in Canada", () => {
    expect(decideTier(evaluateCriteria([...base, fact("location", "Vancouver, BC")], c)).tier).toBe("verified");
  });

  it("rejects people located in another country", () => {
    const e = evaluateCriteria([...base, fact("location", "Seattle, WA")], c);
    expect(decideTier(e)).toEqual({ tier: "rejected", reason: "Located outside Canada (Seattle, WA)" });
    expect(scorePerson(e, base).reasons).toContain("✗ Located outside Canada (Seattle, WA)");
  });

  it("an unknown location can't be verified, but isn't rejected", () => {
    const d = decideTier(evaluateCriteria(base, c));
    expect(d.tier).toBe("possible");
    expect(d.reason).toMatch(/not confirmed in canada/);
  });

  it("conflicting locations lower confidence", () => {
    const e = evaluateCriteria([...base, fact("location", "Toronto", "Toronto", "high", "https://a"), fact("location", "San Francisco, CA", "x", "high", "https://b")], c);
    expect(e.location.confidence).toBe("medium");
    expect(e.location.note).toMatch(/Conflicting/);
  });

  it("a search can allow anywhere", () => {
    expect(decideTier(evaluateCriteria([...base, fact("location", "Seattle, WA")], { ...c, country: null })).tier).toBe("verified");
  });
});
