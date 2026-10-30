import { describe, expect, it } from "vitest";
import { buildFunnel, buildHeatGrid, heatLevel, ringArcs, sparkline } from "./visuals";

describe("buildFunnel", () => {
  const steps = buildFunnel({ discovered: 200, approved: 100, invited: 50, pending: 20, accepted: 10 })!;

  it("has the four steps in order", () => {
    expect(steps.map((s) => s.key)).toEqual(["discovered", "approved", "invited", "accepted"]);
  });
  it("sizes bars against the first step", () => {
    expect(steps.map((s) => s.widthPercent)).toEqual([100, 50, 25, 5]);
  });
  it("says how many dropped out between steps", () => {
    expect(steps.map((s) => s.dropOffPercent)).toEqual([null, 50, 50, 80]);
  });
  it("marks waiting invitations on the invited step only, never counting them as accepted", () => {
    expect(steps.find((s) => s.key === "invited")!.pending).toBe(20);
    expect(steps.find((s) => s.key === "accepted")!.value).toBe(10);
  });
  it("never shows more pending than invited", () => {
    expect(buildFunnel({ discovered: 10, approved: 5, invited: 3, pending: 9, accepted: 0 })!.find((s) => s.key === "invited")!.pending).toBe(3);
  });
  it("has nothing to draw before anyone is discovered", () => {
    expect(buildFunnel({ discovered: 0, approved: 0, invited: 0, pending: 0, accepted: 0 })).toBeNull();
  });
  it("does not report a negative drop when a later step is larger", () => {
    expect(buildFunnel({ discovered: 10, approved: 4, invited: 6, pending: 0, accepted: 0 })!.find((s) => s.key === "invited")!.dropOffPercent).toBe(0);
  });
});

describe("heatLevel", () => {
  it("is 0 only for no activity, and uses the whole 1 to 4 range", () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(1, 10)).toBe(1);
    expect(heatLevel(5, 10)).toBe(2);
    expect(heatLevel(10, 10)).toBe(4);
  });
  it("copes with no maximum", () => expect(heatLevel(3, 0)).toBe(0));
});

describe("buildHeatGrid", () => {
  // 2026-10-05 is a Monday.
  const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"].map((date, i) => ({ date, count: i === 2 ? 4 : i === 7 ? 2 : 0 }));

  it("puts Monday in the first row and starts a new column each Monday", () => {
    const grid = buildHeatGrid(days)!;
    expect(grid.weeks).toHaveLength(2);
    expect(grid.weeks[0][0]!.date).toBe("2026-10-05");
    expect(grid.weeks[0][6]!.date).toBe("2026-10-11");
    expect(grid.weeks[1][0]!.date).toBe("2026-10-12");
    expect(grid.weeks[1][2]).toBeNull();
  });
  it("scales levels to the busiest day and totals the activity", () => {
    const grid = buildHeatGrid(days)!;
    expect(grid.max).toBe(4);
    expect(grid.total).toBe(6);
    expect(grid.weeks[0][2]!.level).toBe(4);
    expect(grid.weeks[1][0]!.level).toBe(2);
  });
  it("pads a first partial week so days land under the right weekday", () => {
    const grid = buildHeatGrid([{ date: "2026-10-07", count: 1 }, { date: "2026-10-08", count: 0 }])!;
    expect(grid.weeks[0].slice(0, 2)).toEqual([null, null]);
    expect(grid.weeks[0][2]!.date).toBe("2026-10-07");
  });
  it("has nothing to draw with no activity at all", () => {
    expect(buildHeatGrid([{ date: "2026-10-05", count: 0 }])).toBeNull();
    expect(buildHeatGrid([])).toBeNull();
  });
});

describe("ringArcs", () => {
  it("shows accepted, then pending after it, as fractions of the goal", () => {
    expect(ringArcs(25, 25, 100)).toEqual({ accepted: 0.25, pending: 0.25, percent: 25 });
  });
  it("never lets pending pass the top of the ring or count toward the percent", () => {
    const arcs = ringArcs(80, 60, 100)!;
    expect(arcs.accepted + arcs.pending).toBeLessThanOrEqual(1);
    expect(arcs.percent).toBe(80);
  });
  it("caps a goal that is passed", () => expect(ringArcs(150, 0, 100)).toEqual({ accepted: 1, pending: 0, percent: 100 }));
  it("has no ring without a goal", () => {
    expect(ringArcs(5, 0, 0)).toBeNull();
    expect(ringArcs(5, 0, -1)).toBeNull();
  });
});

describe("sparkline", () => {
  it("draws one point per value inside the box", () => {
    const s = sparkline([0, 2, 1, 4], 80, 24)!;
    expect(s.points.split(" ")).toHaveLength(4);
    for (const p of s.points.split(" ")) {
      const [x, y] = p.split(",").map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(80);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(24);
    }
  });
  it("puts the highest value at the top", () => {
    const s = sparkline([1, 5, 2])!;
    const ys = s.points.split(" ").map((p) => Number(p.split(",")[1]));
    expect(ys[1]).toBe(Math.min(...ys));
  });
  it("draws nothing for too little or all-zero data", () => {
    expect(sparkline([3])).toBeNull();
    expect(sparkline([0, 0, 0])).toBeNull();
  });
});
