/**
 * "Hide this company" and "hide titles like..." filters. A pattern is stored lower-cased with single
 * spaces (the database checks it). A company pattern must equal the whole company name; a title pattern
 * matches anywhere in the title, so "intern" hides "Software Intern" but "acme" hides only "Acme", not "Acme Labs".
 */

export type HiddenKind = "company" | "title";
export type HiddenFilter = { kind: HiddenKind; pattern: string };

export const MIN_PATTERN = 2;
export const MAX_PATTERN = 80;

/** Lower-case, trimmed, runs of whitespace collapsed to one space. */
export function normalizePattern(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The first filter that hides this posting, or null. */
export function hiddenBy(job: { title: string; company: string | null }, filters: readonly HiddenFilter[]): HiddenFilter | null {
  if (filters.length === 0) return null;
  const title = normalizePattern(job.title);
  const company = job.company ? normalizePattern(job.company) : "";
  return filters.find((f) => (f.kind === "company" ? company !== "" && company === f.pattern : title.includes(f.pattern))) ?? null;
}
