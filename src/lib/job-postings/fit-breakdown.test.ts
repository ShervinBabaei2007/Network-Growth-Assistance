import { describe, expect, it } from "vitest";
import { explainFit } from "./fit";
import { fitBreakdown, payBar } from "./fit-breakdown";
import type { Requirement, RequirementResult } from "./types";

const req = (id: string, category: Requirement["category"], kind: Requirement["kind"] = "must", text = id): Requirement => ({ id, text, kind, category, years: null, degreeLevel: null });
const res = (requirementId: string, status: RequirementResult["status"]): RequirementResult => ({ requirementId, status, quote: null, note: null });
const names = () => [] as string[];

const requirements = [
  req("react", "skill"),
  req("sql", "skill"),
  req("aws", "skill", "nice"),
  req("years", "years"),
  req("degree", "degree"),
  req("auth", "authorization"),
];
const results = [res("react", "met"), res("sql", "missing"), res("aws", "missing"), res("years", "partial"), res("degree", "met"), res("auth", "met")];

describe("fitBreakdown", () => {
  const rows = fitBreakdown(requirements, results, names);

  it("makes one row per area that has requirements, in a fixed order", () => {
    expect(rows.map((r) => r.key)).toEqual(["skills", "level", "eligibility"]);
  });

  it("counts met, partly met and missing, and scores partly met as half", () => {
    const skills = rows[0];
    expect([skills.met, skills.partial, skills.missingCount, skills.total]).toEqual([1, 0, 2, 3]);
    expect(skills.percent).toBe(33);
    expect(rows[1].percent).toBe(75); // one met, one partly met, of two
    expect(rows[2].percent).toBe(100);
  });

  it("leaves out an area the posting says nothing about", () => {
    expect(fitBreakdown([req("a", "skill")], [res("a", "met")], names).map((r) => r.key)).toEqual(["skills"]);
    expect(fitBreakdown([], [], names)).toEqual([]);
  });

  it("treats a requirement with no result as missing", () => {
    const [row] = fitBreakdown([req("a", "skill")], [], names);
    expect(row.missingCount).toBe(1);
    expect(row.percent).toBe(0);
  });

  it("agrees exactly with the explanation text the card already shows", () => {
    const whole = explainFit(requirements, results, names);
    const joined = {
      strong: rows.flatMap((r) => r.strong),
      missing: rows.flatMap((r) => r.missing),
      preferredNotFound: rows.flatMap((r) => r.preferredNotFound),
    };
    expect(new Set(joined.strong)).toEqual(new Set(whole.strong));
    expect(new Set(joined.missing)).toEqual(new Set(whole.missing));
    expect(new Set(joined.preferredNotFound)).toEqual(new Set(whole.preferredNotFound));
  });
});

describe("payBar", () => {
  const pay = { salary_min: 80_000, salary_max: 100_000, salary_period: "year", salary_currency: "CAD" };

  it("has no bar when the posting states no pay", () => {
    expect(payBar({ salary_min: null, salary_max: null, salary_period: null, salary_currency: null }, 90_000, "CAD")).toBeNull();
  });

  it("shows the range and whether it reaches the person's minimum", () => {
    const bar = payBar(pay, 90_000, "CAD")!;
    expect([bar.low, bar.high]).toEqual([80_000, 100_000]);
    expect(bar.meetsMinimum).toBe(true);
    expect(bar.minMarker).not.toBeNull();
    expect(bar.from).toBeLessThan(bar.to);
    expect(payBar(pay, 120_000, "CAD")!.meetsMinimum).toBe(false);
  });

  it("brings hourly pay to a year before comparing", () => {
    const bar = payBar({ salary_min: 40, salary_max: 50, salary_period: "hour", salary_currency: "CAD" }, 90_000, "CAD")!;
    expect(bar.high).toBe(104_000);
    expect(bar.meetsMinimum).toBe(true);
  });

  it("does not compare a minimum across currencies, and does not invent one", () => {
    expect(payBar(pay, 90_000, "USD")!.meetsMinimum).toBeNull();
    expect(payBar(pay, 90_000, "USD")!.minMarker).toBeNull();
    expect(payBar(pay, null, "CAD")!.meetsMinimum).toBeNull();
  });

  it("a single stated number is a one-point range with a visible mark", () => {
    const bar = payBar({ salary_min: 70_000, salary_max: null, salary_period: "year", salary_currency: "CAD" }, null, null)!;
    expect(bar.low).toBe(bar.high);
    expect(bar.to).toBeGreaterThan(bar.from);
  });

  it("keeps everything on a 0 to 100 scale", () => {
    const bar = payBar(pay, 500_000, "CAD")!;
    for (const n of [bar.from, bar.to, bar.minMarker!]) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(100);
    }
  });
});
