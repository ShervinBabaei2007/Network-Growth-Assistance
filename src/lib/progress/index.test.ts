import { describe, expect, it } from "vitest";
import type { Discipline, University } from "@/lib/domain";
import { computeProgress, type ProgressInput } from "./index";

const DISCIPLINES: Discipline[] = ["ce", "ee", "mech", "cs"];

function defaultTargets() {
  return DISCIPLINES.flatMap((discipline) => [
    { discipline, university: null, targetCount: 250 },
    { discipline, university: "uoft" as University, targetCount: 125 },
    { discipline, university: "ubc" as University, targetCount: 125 },
  ]);
}

function input(overrides: Partial<ProgressInput> = {}): ProgressInput {
  return {
    // Friday 2026-10-09, noon in Toronto.
    now: new Date("2026-10-09T16:00:00Z"),
    settings: {
      overallTarget: 2000,
      baselineConnections: 1000,
      projectStartDate: "2026-10-01",
      timezone: "America/Toronto",
      disciplinePriority: DISCIPLINES,
    },
    targets: defaultTargets(),
    latestSnapshot: null,
    invitations: [],
    candidateCounts: [],
    discovered: { today: 0, thisWeek: 0 },
    ...overrides,
  };
}

const accepted = (
  discipline: Discipline,
  university: University,
  resolvedAt = "2026-10-08T15:00:00Z",
  extra: Partial<ProgressInput["invitations"][number]> = {},
): ProgressInput["invitations"][number] => ({
  outcome: "accepted",
  sentAt: "2026-10-02T15:00:00Z",
  resolvedAt,
  discipline,
  university,
  classified: true,
  preexisting: false,
  ...extra,
});

const pendingSent = (sentAt: string): ProgressInput["invitations"][number] => ({
  ...accepted("ce", "uoft"),
  outcome: "pending",
  sentAt,
  resolvedAt: null,
});

describe("computeProgress: what counts toward targets", () => {
  it("counts accepted, classified, post-start invitations", () => {
    const p = computeProgress(input({ invitations: [accepted("ce", "ubc"), accepted("ce", "sfu")] }));
    const ce = p.disciplines[0];
    expect(p.overall.trackedAccepted).toBe(2);
    expect(ce.accepted).toBe(2);
    expect(ce.acceptedPrimary).toBe(1);
    expect(ce.acceptedAdditional).toBe(1);
    expect(ce.remaining).toBe(248);
    expect(ce.primaryCells.find((c) => c.university === "ubc")).toMatchObject({
      accepted: 1,
      target: 125,
      remaining: 124,
    });
  });

  it("never counts pending invitations as connections", () => {
    const p = computeProgress(
      input({
        invitations: [pendingSent("2026-10-08T15:00:00Z")],
      }),
    );
    expect(p.overall.trackedAccepted).toBe(0);
    expect(p.overall.pending).toBe(1);
    expect(p.disciplines[0].pending).toBe(1);
    expect(p.disciplines[0].accepted).toBe(0);
  });

  it("does not count declined or withdrawn invitations", () => {
    const p = computeProgress(
      input({
        invitations: [
          { ...accepted("ce", "uoft"), outcome: "declined" },
          { ...accepted("ce", "uoft"), outcome: "withdrawn" },
        ],
      }),
    );
    expect(p.overall.trackedAccepted).toBe(0);
    expect(p.overall.pending).toBe(0);
  });

  it("holds unconfirmed classifications apart instead of counting them", () => {
    const p = computeProgress(
      input({ invitations: [accepted("ce", "uoft", undefined, { classified: false })] }),
    );
    expect(p.overall.trackedAccepted).toBe(0);
    expect(p.overall.acceptedNeedsClassification).toBe(1);
    expect(p.disciplines[0].accepted).toBe(0);
  });

  it("excludes pre-existing connections and acceptances before the project start", () => {
    const p = computeProgress(
      input({
        invitations: [
          accepted("ce", "uoft", undefined, { preexisting: true }),
          accepted("ce", "uoft", "2026-09-30T15:00:00Z"),
        ],
      }),
    );
    expect(p.overall.trackedAccepted).toBe(0);
    expect(p.overall.acceptedNeedsClassification).toBe(0);
  });

  it("judges the start date in the user's time zone", () => {
    // 01:00 UTC on Oct 1 is still Sep 30 in Toronto, so it is before the start.
    const p = computeProgress(input({ invitations: [accepted("ce", "uoft", "2026-10-01T01:00:00Z")] }));
    expect(p.overall.trackedAccepted).toBe(0);
  });
});

describe("computeProgress: priority and focus", () => {
  it("focuses the first discipline in priority order with an unmet target", () => {
    const targets = defaultTargets().map((t) =>
      t.discipline === "ce" && t.university === null ? { ...t, targetCount: 1 } : t,
    );
    const p = computeProgress(input({ targets, invitations: [accepted("ce", "uoft")] }));
    expect(p.disciplines[0]).toMatchObject({ discipline: "ce", complete: true, isFocus: false });
    expect(p.focus?.discipline).toBe("ee");
    expect(p.disciplines.filter((d) => d.isFocus)).toHaveLength(1);
  });

  it("follows a custom priority order", () => {
    const p = computeProgress(
      input({
        settings: { ...input().settings, disciplinePriority: ["cs", "ce", "ee", "mech"] },
      }),
    );
    expect(p.disciplines.map((d) => d.discipline)).toEqual(["cs", "ce", "ee", "mech"]);
    expect(p.focus?.discipline).toBe("cs");
  });

  it("has no focus when every target is met", () => {
    const targets = defaultTargets().map((t) => ({ ...t, targetCount: 0 }));
    expect(computeProgress(input({ targets })).focus).toBeNull();
  });
});

describe("computeProgress: overall network figures", () => {
  it("measures growth from the baseline toward the overall target", () => {
    const p = computeProgress(
      input({ latestSnapshot: { totalConnections: 1250, recordedAt: "2026-10-09T12:00:00Z" } }),
    );
    expect(p.overall).toMatchObject({
      current: 1250,
      growthGoal: 1000,
      additionalSinceStart: 250,
      remaining: 750,
      percent: 25,
    });
  });

  it("reports unknowns as null rather than guessing", () => {
    const p = computeProgress(
      input({ settings: { ...input().settings, baselineConnections: null } }),
    );
    expect(p.overall).toMatchObject({
      current: null,
      growthGoal: null,
      additionalSinceStart: null,
      remaining: null,
      percent: null,
    });
  });

  it("does not report negative progress as a percentage below zero", () => {
    const p = computeProgress(
      input({ latestSnapshot: { totalConnections: 990, recordedAt: "2026-10-09T12:00:00Z" } }),
    );
    expect(p.overall.additionalSinceStart).toBe(-10);
    expect(p.overall.percent).toBe(0);
  });
});

describe("computeProgress: candidates and activity", () => {
  it("counts review backlog, availability and identified candidates", () => {
    const p = computeProgress(
      input({
        candidateCounts: [
          { discipline: "ce", university: "ubc", status: "approved", classified: true, count: 7 },
          { discipline: "ce", university: "ubc", status: "invitation_pending", classified: true, count: 2 },
          { discipline: "ce", university: "ubc", status: "not_a_match", classified: true, count: 4 },
          { discipline: "ce", university: "sfu", status: "approved", classified: true, count: 3 },
          { discipline: "ce", university: "ubc", status: "approved", classified: false, count: 5 },
          { discipline: null, university: null, status: "new", classified: false, count: 6 },
          { discipline: "ee", university: "uoft", status: "awaiting_review", classified: false, count: 1 },
        ],
      }),
    );
    const ce = p.disciplines[0];
    expect(p.overall.awaitingReview).toBe(7);
    expect(p.overall.readyForOutreach).toBe(10);
    expect(ce.available).toBe(10);
    expect(ce.primaryCells.find((c) => c.university === "ubc")).toMatchObject({
      available: 7,
      identified: 9,
    });
    expect(ce.additionalCells.find((c) => c.university === "sfu")).toMatchObject({
      available: 3,
      identified: 3,
      target: null,
      remaining: null,
    });
  });

  it("buckets activity by local day and Monday-start week", () => {
    const p = computeProgress(
      input({
        invitations: [
          pendingSent("2026-10-09T14:00:00Z"),
          pendingSent("2026-10-05T14:00:00Z"),
          pendingSent("2026-10-04T14:00:00Z"),
          accepted("ee", "ubc", "2026-10-09T13:00:00Z"),
        ],
      }),
    );
    expect(p.today).toBe("2026-10-09");
    expect(p.weekStart).toBe("2026-10-05");
    expect(p.activity).toMatchObject({
      sentToday: 1,
      sentThisWeek: 2,
      acceptedToday: 1,
      acceptedThisWeek: 1,
    });
  });
});
