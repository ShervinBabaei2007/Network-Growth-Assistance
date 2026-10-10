import { describe, expect, it } from "vitest";
import type { Discipline, University } from "@/lib/domain";
import { computeProgress, type ProgressInput } from "@/lib/progress";
import { acceptanceRate, planQueue, type EligibleCandidate, type PlanInput } from "./index";

const DISCIPLINES: Discipline[] = ["ce", "ee", "mech", "cs"];

function disciplines(opts: { targets?: Partial<Record<string, number>>; invitations?: ProgressInput["invitations"] } = {}) {
  const t = (d: Discipline, u: University | null, n: number) => ({
    discipline: d,
    university: u,
    targetCount: opts.targets?.[`${d}:${u ?? "total"}`] ?? n,
  });
  return computeProgress({
    now: new Date("2026-10-09T16:00:00Z"),
    settings: {
      overallTarget: 2000,
      baselineConnections: 1000,
      projectStartDate: "2026-10-01",
      timezone: "America/Toronto",
      disciplinePriority: DISCIPLINES,
    },
    targets: DISCIPLINES.flatMap((d) => [t(d, null, 250), t(d, "uoft", 125), t(d, "ubc", 125)]),
    latestSnapshot: null,
    invitations: opts.invitations ?? [],
    candidateCounts: [],
    discovered: { today: 0, thisWeek: 0 },
  }).disciplines;
}

let seq = 0;
function people(discipline: Discipline, university: University, n: number): EligibleCandidate[] {
  return Array.from({ length: n }, () => {
    seq++;
    return { id: `${discipline}-${university}-${seq}`, discipline, university, discoveredAt: `2026-10-0${(seq % 9) + 1}T00:00:00Z` };
  });
}

function plan(overrides: Partial<PlanInput> = {}) {
  return planQueue({
    disciplines: disciplines(),
    eligible: [],
    skippedToday: [],
    outcomes: { accepted: 0, declined: 0, withdrawn: 0 },
    settings: { paused: false, dailyInviteTarget: 10, weeklyInviteCap: null },
    sentToday: 0,
    sentThisWeek: 0,
    ...overrides,
  });
}

describe("acceptanceRate", () => {
  it("uses a default until enough invitations have resolved", () => {
    expect(acceptanceRate({ accepted: 5, declined: 1, withdrawn: 0 })).toMatchObject({ rate: 0.5, measured: false });
    expect(acceptanceRate({ accepted: 15, declined: 3, withdrawn: 2 })).toMatchObject({ rate: 0.75, measured: true });
  });
});

describe("planQueue", () => {
  it("serves the first discipline in priority order before the next", () => {
    const p = plan({ eligible: [...people("ee", "ubc", 5), ...people("ce", "ubc", 3), ...people("ce", "uoft", 3)] });
    expect(p.items.map((i) => i.discipline)).toEqual(["ce", "ce", "ce", "ce", "ce", "ce", "ee", "ee", "ee", "ee"]);
    expect(p.items.map((i) => i.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("balances U of T and UBC by what each still needs", () => {
    // U of T CE already has 100 accepted, so UBC should get most of today's slots.
    const accepted = Array.from({ length: 100 }, () => ({
      outcome: "accepted" as const,
      sentAt: "2026-10-02T12:00:00Z",
      resolvedAt: "2026-10-03T12:00:00Z",
      discipline: "ce" as const,
      university: "uoft" as const,
      classified: true,
      preexisting: false,
    }));
    const p = plan({
      disciplines: disciplines({ invitations: accepted }),
      eligible: [...people("ce", "uoft", 20), ...people("ce", "ubc", 20)],
    });
    expect(p.items.every((i) => i.university === "ubc")).toBe(true);
    expect(p.items[0].reason).toContain("UBC still needs 125");
  });

  it("uses SFU and Waterloo only when a primary pool runs out, and labels them", () => {
    const p = plan({ eligible: [...people("ce", "uoft", 2), ...people("ce", "sfu", 3), ...people("ce", "waterloo", 3)] });
    const primary = p.items.filter((i) => !i.isAlternate);
    const alternates = p.items.filter((i) => i.isAlternate);
    expect(primary).toHaveLength(2);
    expect(alternates).toHaveLength(6);
    expect(alternates[0].reason).toContain("U of T and UBC pools are short");
    // Primary candidates are always ranked ahead of alternates.
    expect(p.items.slice(0, 2).every((i) => !i.isAlternate)).toBe(true);
  });

  it("never pads with unqualified people and reports the shortfall instead", () => {
    const p = plan({ eligible: people("mech", "waterloo", 1) });
    expect(p.items).toHaveLength(1);
    const uoftMech = p.shortfalls.find((s) => s.discipline === "mech" && s.university === "uoft");
    expect(uoftMech).toMatchObject({ invitesWanted: 250, available: 0 });
    expect(uoftMech?.suggestion).toContain("Mechatronics");
    expect(p.shortfalls.some((s) => s.discipline === "mech" && s.university === null)).toBe(true);
  });

  it("discounts pending invitations so a category isn't over-contacted", () => {
    // 124 of the 125 U of T CE slots are covered by pending invitations at a 100% rate.
    const pending = Array.from({ length: 125 }, () => ({
      outcome: "pending" as const,
      sentAt: "2026-10-02T12:00:00Z",
      resolvedAt: null,
      discipline: "ce" as const,
      university: "uoft" as const,
      classified: true,
      preexisting: false,
    }));
    const p = plan({
      disciplines: disciplines({ invitations: pending }),
      eligible: [...people("ce", "uoft", 5), ...people("ce", "ubc", 5)],
      outcomes: { accepted: 30, declined: 0, withdrawn: 0 },
    });
    expect(p.rateIsMeasured).toBe(true);
    expect(p.items.filter((i) => i.university === "uoft")).toHaveLength(0);
    expect(p.items.filter((i) => i.university === "ubc")).toHaveLength(5);
  });

  it("skips completed disciplines", () => {
    const p = plan({
      disciplines: disciplines({ targets: { "ce:total": 0, "ce:uoft": 0, "ce:ubc": 0 } }),
      eligible: [...people("ce", "ubc", 3), ...people("ee", "ubc", 3)],
    });
    expect(p.items.map((i) => i.discipline)).toEqual(["ee", "ee", "ee"]);
  });

  it("respects the daily target, what was already sent and the weekly cap", () => {
    const eligible = people("ce", "ubc", 30);
    expect(plan({ eligible, sentToday: 4 }).items).toHaveLength(6);
    expect(plan({ eligible, settings: { paused: false, dailyInviteTarget: 10, weeklyInviteCap: 50 }, sentThisWeek: 47 }).items).toHaveLength(3);
    expect(plan({ eligible, sentToday: 10 }).blocked).toBe("capacity-reached");
  });

  it("does nothing while paused or before a daily target is set, but still reports shortfalls", () => {
    const paused = plan({ eligible: people("ce", "ubc", 3), settings: { paused: true, dailyInviteTarget: 10, weeklyInviteCap: null } });
    expect(paused).toMatchObject({ blocked: "paused", items: [] });
    expect(paused.shortfalls.length).toBeGreaterThan(0);
    expect(plan({ settings: { paused: false, dailyInviteTarget: null, weeklyInviteCap: null } }).blocked).toBe("no-daily-target");
  });

  it("does not offer someone skipped earlier today", () => {
    const eligible = people("ce", "ubc", 2);
    const p = plan({ eligible, skippedToday: [eligible[0].id] });
    expect(p.items.map((i) => i.candidateId)).toEqual([eligible[1].id]);
  });

  it("offers the longest-waiting candidates first", () => {
    const eligible: EligibleCandidate[] = [
      { id: "new", discipline: "ce", university: "ubc", discoveredAt: "2026-10-08T00:00:00Z" },
      { id: "old", discipline: "ce", university: "ubc", discoveredAt: "2026-10-01T00:00:00Z" },
    ];
    expect(plan({ eligible }).items.map((i) => i.candidateId)).toEqual(["old", "new"]);
  });
});
