import { describe, expect, it } from "vitest";
import { prefilterScore, scoreFit, type Applicant } from "./fit";
import type { Requirement, RequirementResult } from "./types";

const applicant = (over: Partial<Applicant> = {}): Applicant => ({
  years: 2,
  degree: "bachelor",
  facts: { workAuthorization: "citizen", securityClearance: false, willingToRelocate: false, yearsOverride: null },
  ...over,
});

let n = 0;
const req = (over: Partial<Requirement>): Requirement => ({ id: `r${++n}`, text: "Python", kind: "must", category: "skill", years: null, degreeLevel: null, ...over });
const res = (r: Requirement, status: RequirementResult["status"]): RequirementResult => ({ requirementId: r.id, status, quote: status === "missing" ? null : "x", note: null });

describe("scoreFit knockouts", () => {
  it("excludes a missing required licence", () => {
    const peng = req({ text: "P.Eng licence", category: "licence" });
    const py = req({});
    const out = scoreFit([peng, py], [res(peng, "missing"), res(py, "met")], applicant());
    expect(out.tier).toBe("excluded");
    expect(out.exclusionReasons[0]).toMatch(/P\.Eng/);
  });

  it("does not exclude for a missing preferred licence", () => {
    const peng = req({ text: "P.Eng an asset", category: "licence", kind: "nice" });
    const py = req({});
    expect(scoreFit([peng, py], [res(peng, "missing"), res(py, "met")], applicant()).tier).not.toBe("excluded");
  });

  it("excludes when required years exceed the resume by 3 or more, from the resume's dates", () => {
    const y = req({ text: "7+ years of experience", category: "years", years: 7 });
    const out = scoreFit([y], [res(y, "met")], applicant({ years: 2 }));
    expect(out.tier).toBe("excluded");
    expect(out.exclusionReasons[0]).toMatch(/7 years.*about 2 years/);
  });

  it("treats a small years gap as partial, not a knockout", () => {
    const y = req({ text: "3+ years", category: "years", years: 3 });
    const out = scoreFit([y], [], applicant({ years: 1.5 }));
    expect(out.tier).not.toBe("excluded");
    expect(out.results[0].status).toBe("partial");
  });

  it("excludes a higher required degree, unless equivalent experience is accepted", () => {
    const ms = req({ text: "Master's degree in EE", category: "degree", degreeLevel: "master" });
    expect(scoreFit([ms], [], applicant({ degree: "bachelor" })).tier).toBe("excluded");
    const msEq = req({ text: "Master's degree or equivalent experience", category: "degree", degreeLevel: "master" });
    expect(scoreFit([msEq], [], applicant({ degree: "bachelor" })).tier).not.toBe("excluded");
  });

  it("decides clearance and work authorization from the user's facts, not the model", () => {
    const c = req({ text: "Must hold Secret clearance", category: "clearance" });
    expect(scoreFit([c], [res(c, "met")], applicant()).tier).toBe("excluded");
    expect(scoreFit([c], [res(c, "missing")], applicant({ facts: { ...applicant().facts, securityClearance: true } })).tier).not.toBe("excluded");

    const cit = req({ text: "Must be a Canadian citizen", category: "authorization" });
    expect(scoreFit([cit], [], applicant({ facts: { ...applicant().facts, workAuthorization: "permanent_resident" } })).tier).toBe("excluded");
    const elig = req({ text: "Legally eligible to work in Canada", category: "authorization" });
    expect(scoreFit([elig], [], applicant({ facts: { ...applicant().facts, workAuthorization: "work_permit" } })).tier).not.toBe("excluded");
    expect(scoreFit([elig], [], applicant({ facts: { ...applicant().facts, workAuthorization: "needs_sponsorship" } })).tier).toBe("excluded");
  });

  it("excludes when under half the must-haves are met", () => {
    const rs = [req({ text: "Kubernetes" }), req({ text: "Go" }), req({ text: "Terraform" }), req({ text: "Python" })];
    const out = scoreFit(rs, [res(rs[0], "missing"), res(rs[1], "missing"), res(rs[2], "partial"), res(rs[3], "met")], applicant());
    expect(out.tier).toBe("excluded");
    expect(out.exclusionReasons.at(-1)).toMatch(/Meets 38%.*Kubernetes/);
  });
});

describe("scoreFit tiers", () => {
  it("scores full coverage as strong", () => {
    const rs = [req({}), req({ text: "SQL" }), req({ text: "Docker", kind: "nice" })];
    const out = scoreFit(rs, rs.map((r) => res(r, "met")), applicant());
    expect(out.score).toBe(100);
    expect(out.tier).toBe("strong");
  });

  it("gives partial credit and lands mid-range", () => {
    const rs = [req({}), req({ text: "SQL" }), req({ text: "Docker", kind: "nice" })];
    const out = scoreFit(rs, [res(rs[0], "met"), res(rs[1], "partial"), res(rs[2], "missing")], applicant());
    expect(out.score).toBe(Math.round(70 * 0.75 + 0 + 10));
    expect(out.tier).toBe("good");
  });
});

describe("prefilterScore", () => {
  it("rewards resume skills in the posting and penalises senior titles for juniors", () => {
    const skills = ["python", "sql", "docker"];
    const junior = prefilterScore({ title: "Junior Developer", description: "Python and SQL" }, skills, 1);
    const senior = prefilterScore({ title: "Senior Developer", description: "Python and SQL" }, skills, 1);
    expect(junior).toBeGreaterThan(senior);
  });
});

describe("explainFit", () => {
  it("lists exactly the met and missing requirements, and is deterministic", async () => {
    const { explainFit } = await import("./fit");
    const { skillsIn } = await import("./taxonomy");
    const names = (t: string) => skillsIn(t).map((s) => s.name);
    const reqs = [
      { id: "r1", text: "React and TypeScript", kind: "must" as const, category: "skill" as const, years: null, degreeLevel: null },
      { id: "r2", text: "AWS", kind: "must" as const, category: "skill" as const, years: null, degreeLevel: null },
      { id: "r3", text: "3+ years of professional experience", kind: "nice" as const, category: "years" as const, years: 3, degreeLevel: null },
      { id: "r4", text: "Docker", kind: "nice" as const, category: "skill" as const, years: null, degreeLevel: null },
    ];
    const results = [
      { requirementId: "r1", status: "met" as const, quote: "React and TypeScript app", note: null },
      { requirementId: "r2", status: "missing" as const, quote: null, note: null },
      { requirementId: "r3", status: "missing" as const, quote: null, note: null },
      { requirementId: "r4", status: "partial" as const, quote: null, note: null },
    ];
    const e = explainFit(reqs, results, names);
    expect(e).toEqual({ strong: ["TypeScript", "React"], missing: ["AWS"], preferredNotFound: ["3+ years of professional experience"] });
    expect(explainFit(reqs, results, names)).toEqual(e);
  });
});
