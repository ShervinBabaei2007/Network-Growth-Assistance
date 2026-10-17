import { describe, expect, it } from "vitest";
import { stepIndexFor, TOUR_STEPS } from "./tour-steps";

// Pages a person can reach from the app's menu or from Help.
const APP_ROUTES = ["/overview", "/discover", "/jobs", "/jobs/resume", "/queue", "/candidates", "/people", "/connections", "/applications", "/analytics", "/disciplines", "/universities", "/notifications", "/settings", "/help"];

describe("TOUR_STEPS", () => {
  it("is 15 to 20 stops", () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(15);
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(20);
  });
  it("has unique ids and complete copy", () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(20);
      expect(s.selector.length).toBeGreaterThan(0);
    }
  });
  it("only visits real app pages", () => {
    for (const s of TOUR_STEPS) expect(APP_ROUTES).toContain(s.href);
  });
  it("covers every page in the menu", () => {
    const visited = new Set(TOUR_STEPS.map((s) => s.href));
    for (const route of APP_ROUTES) expect(visited.has(route)).toBe(true);
  });
  it("finds the stop for a page, falling back to the first", () => {
    expect(TOUR_STEPS[stepIndexFor("/queue")].id).toBe("queue");
    expect(stepIndexFor("/nowhere")).toBe(0);
  });
});
