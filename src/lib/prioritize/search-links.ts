import { DISCIPLINE_LABELS, SHORT_UNIVERSITY, type Discipline, type University } from "@/lib/domain";
import { ADDITIONAL_UNIVERSITIES, type DisciplineProgress } from "@/lib/progress";

export type SearchLink = {
  discipline: Discipline;
  university: University;
  label: string;
  url: string;
  /** Accepted connections still needed for this cell, when it has a target. */
  remaining: number | null;
  isAlternate: boolean;
};

// How each school is usually written in headlines.
const SCHOOL_TERM: Record<University, string> = {
  uoft: "University of Toronto",
  ubc: "UBC",
  sfu: "SFU",
  waterloo: "University of Waterloo",
};

// Program wording as students usually write it in headlines.
const PROGRAM_TERM: Record<Discipline, Partial<Record<University, string>> & { default: string }> = {
  ce: { default: "computer engineering" },
  ee: { default: "electrical engineering" },
  mech: { default: "mechatronics", sfu: "mechatronic systems engineering" },
  cs: { default: "computer science", sfu: "computing science" },
};

export function linkedInPeopleSearch(keywords: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}

/**
 * Ready-made LinkedIn people searches for the categories that still need
 * connections, most important first: disciplines in priority order, U of T and
 * UBC before SFU and Waterloo, and the cell with the most still needed first.
 * They only open LinkedIn in the user's browser; nothing is fetched.
 */
export function searchLinks(disciplines: DisciplineProgress[], limit = 6): SearchLink[] {
  const links: SearchLink[] = [];
  for (const d of disciplines) {
    if (d.complete) continue;
    const primary = d.primaryCells
      .filter((c) => c.remaining === null || c.remaining > 0)
      .sort((a, b) => (b.remaining ?? 0) - (a.remaining ?? 0));
    const cells = [
      ...primary.map((c) => ({ university: c.university, remaining: c.remaining, isAlternate: false })),
      ...ADDITIONAL_UNIVERSITIES.map((u) => ({ university: u, remaining: null, isAlternate: true })),
    ];
    for (const c of cells) {
      const program = PROGRAM_TERM[d.discipline][c.university] ?? PROGRAM_TERM[d.discipline].default;
      links.push({
        discipline: d.discipline,
        university: c.university,
        label: `${DISCIPLINE_LABELS[d.discipline]} · ${SHORT_UNIVERSITY[c.university]}`,
        url: linkedInPeopleSearch(`${program} student ${SCHOOL_TERM[c.university]}`),
        remaining: c.remaining,
        isAlternate: c.isAlternate,
      });
    }
  }
  // Primary cells of every active discipline come before any alternates.
  const ordered = [...links.filter((l) => !l.isAlternate), ...links.filter((l) => l.isAlternate)];
  return ordered.slice(0, limit);
}
