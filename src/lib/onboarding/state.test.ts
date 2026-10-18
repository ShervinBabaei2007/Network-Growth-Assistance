import { describe, expect, it } from "vitest";
import {
  buildChecklist,
  checklistComplete,
  finish,
  firstActionFor,
  goToStep,
  restart,
  shouldShowWizard,
  skip,
  WIZARD_STEPS,
} from "./steps";
import { onboardingInputSchema, parseOnboarding } from "./state";

const facts = { hasPlan: false, hasBaseline: false, hasCandidates: false, hasSearch: false, hasResume: false, hasJobActivity: false };

describe("parseOnboarding", () => {
  it("treats an empty row as a brand-new user", () => {
    expect(parseOnboarding({})).toEqual({ status: "new", step: 0, goal: undefined, tourDone: false, tourStep: 0, checklistDismissed: false });
  });
  it("falls back safely on malformed values", () => {
    for (const bad of [null, undefined, [1], "x", 3]) expect(parseOnboarding(bad).status).toBe("new");
    const s = parseOnboarding({ status: "weird", step: 99, goal: "all", tourDone: "yes" });
    expect(s).toMatchObject({ status: "new", step: 0, tourDone: false });
    expect(s.goal).toBeUndefined();
  });
  it("keeps valid values", () => {
    expect(parseOnboarding({ status: "in_progress", step: 2, goal: "jobs" })).toMatchObject({ status: "in_progress", step: 2, goal: "jobs" });
  });
});

describe("shouldShowWizard", () => {
  it("shows for new and in-progress users only", () => {
    expect(shouldShowWizard(parseOnboarding({}))).toBe(true);
    expect(shouldShowWizard(parseOnboarding({ status: "in_progress" }))).toBe(true);
    expect(shouldShowWizard(parseOnboarding({ status: "skipped" }))).toBe(false);
    expect(shouldShowWizard(parseOnboarding({ status: "done" }))).toBe(false);
  });
});

describe("transitions", () => {
  const base = parseOnboarding({});
  it("skipping and finishing stop the interruptions", () => {
    expect(shouldShowWizard(skip(base))).toBe(false);
    expect(shouldShowWizard(finish(base))).toBe(false);
  });
  it("resumes where the user left off", () => {
    const mid = goToStep(base, 2);
    expect(mid).toMatchObject({ status: "in_progress", step: 2 });
    expect(shouldShowWizard(mid)).toBe(true);
  });
  it("clamps the step", () => {
    expect(goToStep(base, -3).step).toBe(0);
    expect(goToStep(base, 99).step).toBe(WIZARD_STEPS - 1);
  });
  it("restart reopens the guide and brings the checklist back, keeping the goal", () => {
    const done = { ...finish(base), goal: "jobs" as const, tourDone: true, checklistDismissed: true, step: 3 };
    expect(restart(done)).toMatchObject({ status: "in_progress", step: 0, tourDone: false, checklistDismissed: false, goal: "jobs" });
  });
});

describe("onboardingInputSchema", () => {
  it("rejects unknown statuses and out-of-range steps, and strips extra keys", () => {
    const ok = { status: "done", step: 0, tourDone: true, tourStep: 0, checklistDismissed: false };
    expect(onboardingInputSchema.safeParse(ok).success).toBe(true);
    expect(onboardingInputSchema.safeParse({ ...ok, status: "admin" }).success).toBe(false);
    expect(onboardingInputSchema.safeParse({ ...ok, step: 9 }).success).toBe(false);
    expect(onboardingInputSchema.parse({ ...ok, extra: "x" })).not.toHaveProperty("extra");
  });
});

describe("firstActionFor", () => {
  it("picks one action by goal", () => {
    expect(firstActionFor("jobs").href).toBe("/jobs/resume");
    expect(firstActionFor("network").href).toBe("/discover");
    expect(firstActionFor("both").href).toBe("/discover");
    expect(firstActionFor(undefined).href).toBe("/discover");
  });
});

describe("buildChecklist", () => {
  it("scopes items to the chosen goal", () => {
    expect(buildChecklist("jobs", facts).map((i) => i.id)).toEqual(["resume", "job"]);
    expect(buildChecklist("network", facts).map((i) => i.id)).toEqual(["plan", "baseline", "discover", "candidate"]);
    expect(buildChecklist("both", facts)).toHaveLength(6);
  });
  it("derives completion from real facts", () => {
    const items = buildChecklist("jobs", { ...facts, hasResume: true });
    expect(items.find((i) => i.id === "resume")?.done).toBe(true);
    expect(checklistComplete(items)).toBe(false);
    expect(checklistComplete(buildChecklist("jobs", { ...facts, hasResume: true, hasJobActivity: true }))).toBe(true);
  });
});

describe("merging a partial update", () => {
  it("accepts a partial patch and rejects unknown values", async () => {
    const { onboardingPatchSchema } = await import("./state");
    expect(onboardingPatchSchema.safeParse({ tourDone: true }).success).toBe(true);
    expect(onboardingPatchSchema.safeParse({ checklistDismissed: true, tourStep: 2 }).success).toBe(true);
    expect(onboardingPatchSchema.safeParse({ status: "root" }).success).toBe(false);
    expect(onboardingPatchSchema.parse({ tourDone: true, isAdmin: true })).toEqual({ tourDone: true });
  });
  it("a stale tour patch can't undo a finished welcome", () => {
    const stored = { ...finish(parseOnboarding({})), tourStep: 0 };
    const merged = onboardingInputSchema.parse({ ...stored, ...{ tourDone: true, tourStep: 0 } });
    expect(merged.status).toBe("done");
  });
});
