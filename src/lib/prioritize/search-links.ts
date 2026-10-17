import { disciplineName, poolUniversities, universityName, type Catalog, type Discipline, type University } from "@/lib/domain";
import type { DisciplineProgress } from "@/lib/progress";

export type SearchLink = {
  discipline: Discipline;
  university: University;
  label: string;
  url: string;
  /** Accepted connections still needed for this cell, when it has a target. */
  remaining: number | null;
  isAlternate: boolean;
};

export function linkedInPeopleSearch(keywords: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}

/**
 * Ready-made LinkedIn people searches for the categories that still need
 * connections, most important first: disciplines in priority order, schools with their
 * own targets before the user's other schools, and the cell with the most still needed
 * first. The search words are the user's own names for them. They only open LinkedIn in
 * the user's browser; nothing is fetched.
 */
export function searchLinks(disciplines: DisciplineProgress[], catalog: Catalog, limit = 6): SearchLink[] {
  const links: SearchLink[] = [];
  for (const d of disciplines) {
    if (d.complete) continue;
    const primary = d.primaryCells
      .filter((c) => c.remaining === null || c.remaining > 0)
      .sort((a, b) => (b.remaining ?? 0) - (a.remaining ?? 0));
    const cells = [
      ...primary.map((c) => ({ university: c.university, remaining: c.remaining, isAlternate: false })),
      ...poolUniversities(catalog).map((u) => ({ university: u.id, remaining: null, isAlternate: true })),
    ];
    for (const c of cells) {
      const program = disciplineName(catalog, d.discipline);
      const school = universityName(catalog, c.university);
      links.push({
        discipline: d.discipline,
        university: c.university,
        label: `${program} · ${school}`,
        url: linkedInPeopleSearch(`${program} ${school}`),
        remaining: c.remaining,
        isAlternate: c.isAlternate,
      });
    }
  }
  // Primary cells of every active discipline come before any alternates.
  const ordered = [...links.filter((l) => !l.isAlternate), ...links.filter((l) => l.isAlternate)];
  return ordered.slice(0, limit);
}
