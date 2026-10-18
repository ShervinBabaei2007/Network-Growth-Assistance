import { describe, expect, it } from "vitest";
import { normalizeTrack, recommendTrack, requirementCoverage, trackPattern } from "./tracks";
import type { Requirement, RequirementResult } from "./types";

const req = (id: string, kind: "must" | "nice", text = id): Requirement => ({ id, text, kind, category: "skill", years: null, degreeLevel: null });
const res = (id: string, status: RequirementResult["status"]): RequirementResult => ({ requirementId: id, status, quote: null, note: null });

describe("track names", () => {
  it("collapse spaces, cap the length and treat blank or 'main' as the main resume", () => {
    expect(normalizeTrack("  Data   Science ")).toBe("Data Science");
    expect(normalizeTrack("")).toBeNull();
    expect(normalizeTrack(" MAIN ")).toBeNull();
    expect(normalizeTrack(null)).toBeNull();
    expect(normalizeTrack("x".repeat(80))).toHaveLength(40);
  });
});

describe("recommending a track", () => {
  it("needs at least two tracks", () => {
    expect(recommendTrack([{ track: null, score: 80 }])).toBeNull();
  });
  it("picks the clearly better fit and says why", () => {
    const r = recommendTrack([{ track: null, score: 60 }, { track: "Data", score: 82 }]);
    expect(r?.track).toBe("Data");
    expect(r?.reason).toBe("Data fits best: 82, against 60 for Main.");
  });
  it("prefers the main resume when the fits are about equal", () => {
    const r = recommendTrack([{ track: "Data", score: 71 }, { track: null, score: 68 }]);
    expect(r?.track).toBeNull();
    expect(r?.reason).toMatch(/about equally/);
  });
});

describe("requirement coverage", () => {
  it("counts required requirements met and lists what is missing, required first", () => {
    const c = requirementCoverage(
      [req("r1", "must", "SQL"), req("r2", "nice", "Go"), req("r3", "must", "Python"), req("r4", "must", "Spark")],
      [res("r1", "met"), res("r2", "missing"), res("r3", "partial")],
    );
    expect(c.mustTotal).toBe(3);
    expect(c.mustMet).toBe(1);
    expect(c.missing.map((m) => m.text)).toEqual(["Spark", "Go"]);
  });
});

describe("track patterns", () => {
  it("escape wildcards so a name matches only itself", () => {
    expect(trackPattern("Data")).toBe("Data");
    expect(trackPattern("100%_ok")).toBe("100\\%\\_ok");
    expect(trackPattern("a\\b")).toBe("a\\\\b");
  });
});
