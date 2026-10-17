import type { Catalog, Discipline, University } from "@/lib/domain";
import { clean, has, hasAny } from "@/lib/text/match";

/**
 * Sorts a candidate into one of the user's own schools and disciplines, from what their
 * profile says. A school or discipline matches by its name or any of the user's aliases
 * for it, as whole words. Nothing is built in: an empty list matches nothing.
 */

export type Confidence = "confirmed" | "needs_review";

export type Classified<T> = { value: T | null; confidence: Confidence; reason: string };

/** The phrases that identify an entry: its name and its aliases, cleaned, without duplicates. */
export const phrasesFor = (entry: { name: string; aliases: readonly string[] }) =>
  [...new Set([entry.name, ...entry.aliases].map((p) => clean(p).trim()).filter(Boolean))];

function matchOne<T extends string>(
  text: string,
  entries: readonly { id: T; name: string; aliases: readonly string[] }[],
  what: { one: string; many: string; none: string; empty: string },
): Classified<T> {
  const t = clean(text);
  if (!t.trim()) return { value: null, confidence: "needs_review", reason: what.empty };
  if (!entries.length) return { value: null, confidence: "needs_review", reason: what.none };
  const found = entries.filter((e) => hasAny(t, phrasesFor(e)));
  if (found.length === 1) return { value: found[0].id, confidence: "confirmed", reason: what.one };
  if (found.length > 1) return { value: null, confidence: "needs_review", reason: what.many };
  return { value: null, confidence: "needs_review", reason: "Not one of your schools or disciplines. Add it in Settings, or pick it here." };
}

export function classifyUniversity(text: string | null | undefined, catalog: Catalog): Classified<University> {
  return matchOne(text ?? "", catalog.universities, {
    one: "Matched the school name.",
    many: "Mentions more than one of your schools.",
    none: "You haven't added any schools yet (Settings → Schools).",
    empty: "No school given.",
  });
}

export function classifyDiscipline(text: string | null | undefined, catalog: Catalog): Classified<Discipline> {
  const t = clean(text);
  // "…, minor in X": the major isn't clear from the text.
  if (t.trim() && has(t, "minor")) return { value: null, confidence: "needs_review", reason: "Mentions a minor; confirm the major." };
  return matchOne(text ?? "", catalog.disciplines, {
    one: "Matched the discipline name.",
    many: "Mentions more than one of your disciplines.",
    none: "You haven't added any disciplines yet (Settings → Disciplines).",
    empty: "No program given.",
  });
}

/** Classifies both fields against the user's own schools and disciplines. */
export function classifyCandidate(schoolText: string | null | undefined, programText: string | null | undefined, catalog: Catalog) {
  return { university: classifyUniversity(schoolText, catalog), discipline: classifyDiscipline(programText, catalog) };
}
