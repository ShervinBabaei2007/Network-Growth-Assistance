import { describe, expect, it } from "vitest";
import { identitySignature, matchBand, matchKnownConnection, scoreKnownMatch, type KnownConnectionLite, type Override } from "./known-match";
import { identitySimilarity, resolveIdentity, sameCompany, type IdentityRecord } from "./resolve";

const rec = (over: Partial<IdentityRecord> = {}): IdentityRecord => ({ fullName: "John Smith", currentCompany: null, institutions: [], location: null, identityKeys: [], ...over });

describe("entity resolution", () => {
  it("never merges on a common name alone", () => {
    const d = resolveIdentity(rec(), [{ ...rec(), id: "1" }]);
    expect(d.kind).toBe("new");
    if (d.kind === "new") expect(d.possibleDuplicateOf).toBeNull();
  });

  it("merges the same name + school + employer", () => {
    const a = rec({ currentCompany: "Amazon", institutions: ["University of Toronto"] });
    const d = resolveIdentity(a, [{ ...a, id: "1", currentCompany: "Amazon Web Services" }]);
    expect(d.kind).toBe("merge");
  });

  it("merges on a shared GitHub login", () => {
    const d = resolveIdentity(rec({ identityKeys: ["github:jsmith"] }), [{ ...rec({ identityKeys: ["github:jsmith", "domain:js.dev"] }), id: "1" }]);
    expect(d.kind).toBe("merge");
  });

  it("flags name + school as a possible duplicate only", () => {
    const d = resolveIdentity(rec({ institutions: ["University of Toronto"] }), [{ ...rec({ institutions: ["University of Toronto"] }), id: "1" }]);
    expect(d.kind).toBe("new");
    if (d.kind === "new") expect(d.possibleDuplicateOf?.id).toBe("1");
  });

  it("keeps John Smith @ Amazon and John Smith @ Microsoft apart", () => {
    expect(identitySimilarity(rec({ currentCompany: "Amazon" }), rec({ currentCompany: "Microsoft" })).score).toBeLessThan(0.6);
  });

  it("different GitHub accounts mean different people", () => {
    expect(identitySimilarity(rec({ identityKeys: ["github:a"], currentCompany: "X" }), rec({ identityKeys: ["github:b"], currentCompany: "X" })).score).toBeLessThan(0.6);
  });

  it("compares companies loosely but safely", () => {
    expect(sameCompany("Amazon Web Services, Inc.", "amazon")).toBe(true);
    expect(sameCompany("Apple", "Applied Materials")).toBe(false);
    expect(sameCompany(null, "Apple")).toBeNull();
  });
});

describe("known connection dedupe", () => {
  const known: KnownConnectionLite[] = [
    { id: "k1", fullName: "John Smith", company: "Amazon", position: "Software Engineer", linkedinKey: null },
    { id: "k2", fullName: "Priya Patel", company: null, position: "Student at University of Toronto", linkedinKey: null },
    { id: "k3", fullName: "Alex Chen", company: "AMD", position: null, linkedinKey: "alex-chen-1" },
  ];
  const person = (over = {}) => ({ fullName: "John Smith", currentCompany: null as string | null, currentTitle: null as string | null, linkedinKey: null as string | null, institutions: [] as string[], ...over });

  it("John Smith @ Microsoft is not my John Smith @ Amazon", () => {
    const m = matchKnownConnection(person({ currentCompany: "Microsoft" }), known);
    expect(m!.confidence).toBeLessThan(0.75);
    expect(matchBand(m!.confidence)).toBe("none");
  });

  it("same name and same company is hidden automatically", () => {
    const m = matchKnownConnection(person({ currentCompany: "Amazon Web Services" }), known);
    expect(m!.known.id).toBe("k1");
    expect(matchBand(m!.confidence)).toBe("auto_hidden");
  });

  it("same name with nothing to compare asks the user", () => {
    expect(matchBand(matchKnownConnection(person(), known)!.confidence)).toBe("needs_review");
  });

  it("matches on name + role and name + education", () => {
    expect(scoreKnownMatch(person({ currentTitle: "Senior Software Engineer" }), known[0]).confidence).toBe(0.88);
    expect(scoreKnownMatch(person({ fullName: "Priya Patel", institutions: ["University of Toronto"] }), known[1]).confidence).toBe(0.88);
  });

  it("an equal LinkedIn URL is certain, a different one rules it out", () => {
    expect(matchKnownConnection(person({ fullName: "Alex Chen", linkedinKey: "alex-chen-1" }), known)!.confidence).toBe(1);
    expect(matchKnownConnection(person({ fullName: "Alex Chen", linkedinKey: "alex-chen-2", currentCompany: "AMD" }), known)).toBeNull();
  });

  it("handles nicknames and typos with corroboration only", () => {
    expect(scoreKnownMatch(person({ fullName: "Alexander Chen", currentCompany: "AMD" }), { ...known[2], linkedinKey: null }).confidence).toBe(0.9);
    expect(scoreKnownMatch(person({ fullName: "Alexander Chen" }), { ...known[2], linkedinKey: null, company: null }).confidence).toBeLessThan(0.75);
    expect(scoreKnownMatch(person({ fullName: "Jon Smith", currentCompany: "Amazon" }), known[0]).confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("applies the user's overrides", () => {
    const p = person({ currentCompany: "Amazon" });
    const overrides = new Map<string, Override[]>([[identitySignature(p), [{ knownConnectionId: "k1", samePerson: false }]]]);
    expect(matchKnownConnection(p, known, overrides)).toBeNull();
    const confirm = new Map<string, Override[]>([[identitySignature(person()), [{ knownConnectionId: "k1", samePerson: true }]]]);
    expect(matchKnownConnection(person(), known, confirm)).toMatchObject({ confidence: 1, known: { id: "k1" } });
  });
});
