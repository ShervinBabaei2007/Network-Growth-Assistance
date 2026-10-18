import { describe, expect, it } from "vitest";
import { buildColumn, MAX_COMPARE, NOT_STATED, parseCompareIds, type CompareJob } from "./compare-jobs";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const job: CompareJob = {
  id: id(1), title: "Developer", company: "Acme", city: "Vancouver", province: "BC", country: "CA", countries: ["CA"], remote: false,
  workplace_type: null, posted_at: new Date().toISOString(), date_source: "provider", date_note: null, salary: null,
  employment_type: null, experience_level: null, source: "ats",
};

describe("comparing jobs", () => {
  it("keeps at most three unique, well-formed ids", () => {
    expect(parseCompareIds([id(1), id(1), id(2), "nope", id(3), id(4)].join(","))).toEqual([id(1), id(2), id(3)]);
    expect(parseCompareIds(undefined)).toEqual([]);
    expect(MAX_COMPARE).toBe(3);
  });

  it("says 'Not stated' for missing fields instead of guessing", () => {
    const c = buildColumn(job, null, "Employer site");
    expect(c.rows.pay).toBe(NOT_STATED);
    expect(c.rows.level).toBe(NOT_STATED);
    expect(c.rows.workplace).toBe(NOT_STATED);
    expect(c.fit).toBeNull();
  });

  it("shows stored pay and a remote job's workplace", () => {
    const c = buildColumn({ ...job, salary: "$90,000 - $110,000", remote: true }, { tier: "good", score: 70, strong: ["React"], missing: ["Go"] }, "Employer site");
    expect(c.rows.pay).toBe("$90,000 - $110,000");
    expect(c.rows.workplace).toBe("Remote");
    expect(c.strong).toEqual(["React"]);
    expect(c.missing).toEqual(["Go"]);
  });
});
