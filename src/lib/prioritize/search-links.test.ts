import { describe, expect, it } from "vitest";
import type { Discipline } from "@/lib/domain";
import { computeProgress, type ProgressInput } from "@/lib/progress";
import { linkedInPeopleSearch, searchLinks } from "./search-links";

const DISCIPLINES: Discipline[] = ["ce", "ee", "mech", "cs"];

function progress(invitations: ProgressInput["invitations"] = [], targets?: ProgressInput["targets"]) {
  return computeProgress({
    now: new Date("2026-10-09T16:00:00Z"),
    settings: { overallTarget: 2000, baselineConnections: 1000, projectStartDate: "2026-10-01", timezone: "America/Toronto", disciplinePriority: DISCIPLINES },
    targets: targets ?? DISCIPLINES.flatMap((d) => [
      { discipline: d, university: null, targetCount: 250 },
      { discipline: d, university: "uoft" as const, targetCount: 125 },
      { discipline: d, university: "ubc" as const, targetCount: 125 },
    ]),
    latestSnapshot: null,
    invitations,
    candidateCounts: [],
    discovered: { today: 0, thisWeek: 0 },
  }).disciplines;
}

describe("linkedInPeopleSearch", () => {
  it("builds an encoded people-search URL", () => {
    expect(linkedInPeopleSearch("computer engineering student UBC")).toBe(
      "https://www.linkedin.com/search/results/people/?keywords=computer%20engineering%20student%20UBC",
    );
  });
});

describe("searchLinks", () => {
  it("lists primary schools of every active discipline before alternates, in priority order", () => {
    const links = searchLinks(progress(), 10);
    expect(links.map((l) => l.label).slice(0, 8)).toEqual([
      "Computer Engineering · U of T",
      "Computer Engineering · UBC",
      "Electrical Engineering · U of T",
      "Electrical Engineering · UBC",
      "Mechatronics Engineering · U of T",
      "Mechatronics Engineering · UBC",
      "Computer Science · U of T",
      "Computer Science · UBC",
    ]);
    expect(links.slice(8).every((l) => l.isAlternate)).toBe(true);
  });

  it("puts the school with the most still needed first", () => {
    const accepted = Array.from({ length: 10 }, () => ({
      outcome: "accepted" as const,
      sentAt: "2026-10-02T12:00:00Z",
      resolvedAt: "2026-10-03T12:00:00Z",
      discipline: "ce" as const,
      university: "uoft" as const,
      classified: true,
      preexisting: false,
    }));
    const [first, second] = searchLinks(progress(accepted));
    expect(first).toMatchObject({ label: "Computer Engineering · UBC", remaining: 125 });
    expect(second).toMatchObject({ label: "Computer Engineering · U of T", remaining: 115 });
  });

  it("skips completed disciplines", () => {
    const targets = DISCIPLINES.flatMap((d) => [
      { discipline: d, university: null, targetCount: d === "ce" ? 0 : 250 },
      { discipline: d, university: "uoft" as const, targetCount: d === "ce" ? 0 : 125 },
      { discipline: d, university: "ubc" as const, targetCount: d === "ce" ? 0 : 125 },
    ]);
    expect(searchLinks(progress([], targets)).some((l) => l.discipline === "ce")).toBe(false);
  });

  it("uses each school's own program wording", () => {
    const sfuMech = searchLinks(progress(), 50).find((l) => l.discipline === "mech" && l.university === "sfu");
    expect(decodeURIComponent(sfuMech!.url)).toContain("mechatronic systems engineering student SFU");
  });
});
