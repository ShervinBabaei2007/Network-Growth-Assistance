import { describe, expect, it } from "vitest";
import { checkGrounded } from "./grounding";
import { suggestIntro, rewriteIntro, type IntroFacts } from "./messages";
import { validateRerank, type RerankPerson } from "./rerank";
import type { LLMProvider } from "./llm";

const people: RerankPerson[] = [
  { id: "p1", name: "Alex Chen", relevance: 96, facts: [{ id: "f1", field: "company", value: "AMD", confidence: "high" }, { id: "f2", field: "program", value: "Computer Engineering", confidence: "high" }] },
];
const ctx = { goal: "junior full-stack developer looking for internships", me: { school: "UBC", program: "Computer Science", interests: "backend systems" }, request: "UofT CE" };
const out = (over = {}) => ({ personId: "p1", networkingValueScore: 88, reasonForConnecting: "Computer Engineering graduate now at AMD, a path close to yours.", conversationAngle: "Ask which projects helped most in AMD interviews.", evidenceIds: ["f1", "f2"], ...over });

describe("validateRerank", () => {
  it("accepts grounded output", () => {
    const r = validateRerank([out()], people, ctx);
    expect(r.rejected).toBe(0);
    expect(r.results.get("p1")?.networkingValueScore).toBe(88);
  });

  it("rejects unknown evidence ids and unknown people", () => {
    expect(validateRerank([out({ evidenceIds: ["f9"] })], people, ctx).rejected).toBe(1);
    expect(validateRerank([out({ personId: "nobody" })], people, ctx).rejected).toBe(1);
  });

  it("rejects invented employers and fake familiarity", () => {
    expect(validateRerank([out({ reasonForConnecting: "Former Google engineer now at AMD." })], people, ctx).rejected).toBe(1);
    expect(validateRerank([out({ conversationAngle: "Mention your mutual connection at AMD." })], people, ctx).rejected).toBe(1);
    expect(validateRerank([out({ reasonForConnecting: "A 2nd-degree connection at AMD." })], people, ctx).rejected).toBe(1);
  });

  it("clamps the score", () => {
    expect(validateRerank([out({ networkingValueScore: 140.4 })], people, ctx).results.get("p1")?.networkingValueScore).toBe(100);
  });
});

describe("intro messages", () => {
  const facts: IntroFacts = { personId: "p1", fullName: "Alex Chen", institution: "University of Toronto", program: "Computer Engineering", role: "Backend Engineer", company: "AMD", me: { school: "UBC", program: "Computer Science", interests: "backend systems", goal: null } };

  it("uses only verified facts and stays short", () => {
    const m = suggestIntro(facts);
    expect(m.length).toBeLessThanOrEqual(300);
    expect(m).toContain("UofT Computer Engineering");
    expect(m).toContain("AMD");
    expect(checkGrounded(m, [facts.fullName, "UofT", facts.institution, facts.program, facts.role, facts.company, facts.me.school, facts.me.program, facts.me.interests], 300).ok).toBe(true);
  });

  it("says less when less is known", () => {
    expect(suggestIntro({ ...facts, institution: null, program: null, role: null, company: null, me: { school: null, program: null, interests: null, goal: null } })).toBe("Hi Alex, I'd love to connect and learn from your experience.");
  });

  it("discards an AI rewrite that invents details", async () => {
    const llm: LLMProvider = { enabled: true, structured: async () => ({ ok: true, data: { message: "Hi Alex, loved your talk at Google I/O. Would love to connect." } as never }) };
    const r = await rewriteIntro(llm, facts, suggestIntro(facts));
    expect(r.ok).toBe(false);
  });

  it("keeps a grounded AI rewrite", async () => {
    const llm: LLMProvider = { enabled: true, structured: async () => ({ ok: true, data: { message: "Hi Alex, I study Computer Science at UBC and your path from UofT Computer Engineering to AMD stood out. I'd love to connect." } as never }) };
    expect(await rewriteIntro(llm, facts, "draft")).toMatchObject({ ok: true });
  });
});
