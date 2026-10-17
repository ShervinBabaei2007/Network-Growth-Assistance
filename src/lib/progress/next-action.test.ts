import { describe, expect, it } from "vitest";
import { TEST_CATALOG, withPriority } from "@/test/catalog";
import type { Discipline } from "@/lib/domain";
import { computeProgress, type ProgressInput } from "./index";
import { nextAction } from "./next-action";

const DISCIPLINES: Discipline[] = ["ce", "ee", "mech", "cs"];

function progress(overrides: Partial<ProgressInput> = {}, settings: Partial<ProgressInput["settings"]> = {}, catalog = TEST_CATALOG) {
  return computeProgress({
    now: new Date("2026-10-09T16:00:00Z"),
    settings: {
      overallTarget: 2000,
      baselineConnections: 1000,
      projectStartDate: "2026-10-01",
      timezone: "America/Toronto",
      ...settings,
    },
    catalog,
    targets: DISCIPLINES.map((discipline) => ({ discipline, university: null, targetCount: 250 })),
    latestSnapshot: null,
    invitations: [],
    candidateCounts: [],
    discovered: { today: 0, thisWeek: 0 },
    ...overrides,
  });
}

const counts = (status: "approved" | "awaiting_review", count: number) => ({
  candidateCounts: [{ discipline: "ce" as const, university: "ubc" as const, status, classified: true, count }],
});

describe("nextAction", () => {
  it("puts a paused account ahead of everything", () => {
    expect(nextAction(progress(counts("approved", 5)), true).kind).toBe("paused");
  });

  it("asks for a baseline before anything else", () => {
    expect(nextAction(progress({}, { baselineConnections: null }), false).kind).toBe("set-baseline");
  });

  it("asks to classify accepted connections that can't be counted yet", () => {
    const p = progress({
      invitations: [
        {
          outcome: "accepted",
          sentAt: "2026-10-02T12:00:00Z",
          resolvedAt: "2026-10-03T12:00:00Z",
          discipline: null,
          university: null,
          classified: false,
          preexisting: false,
        },
      ],
    });
    expect(nextAction(p, false)).toMatchObject({ kind: "classify-accepted", href: "/candidates?status=connected&review=1" });
  });

  it("sends people to the queue when approved candidates are waiting", () => {
    const a = nextAction(progress(counts("approved", 3)), false);
    expect(a.kind).toBe("send-invitations");
    expect(a.title).toContain("Computer Engineering");
  });

  it("asks for review when nothing is approved yet", () => {
    expect(nextAction(progress(counts("awaiting_review", 2)), false).kind).toBe("review-candidates");
  });

  it("asks to find candidates for the focus discipline when the pool is empty", () => {
    const a = nextAction(progress({}, {}, withPriority(["ee", "ce", "mech", "cs"])), false);
    expect(a.kind).toBe("find-candidates");
    expect(a.title).toContain("Electrical Engineering");
  });

  it("reports when every target is met", () => {
    const p = progress({
      targets: DISCIPLINES.map((discipline) => ({ discipline, university: null, targetCount: 0 })),
    });
    expect(nextAction(p, false).kind).toBe("goal-met");
  });
});
