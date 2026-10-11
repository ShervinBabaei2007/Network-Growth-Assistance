import { clean } from "@/lib/text/match";
import { compareNames, normalizeName } from "@/lib/text/names";
import { normalizeCompany, sameCompany } from "./resolve";

/**
 * Is a discovered person already one of the user's known 1st-degree connections?
 * Only the user's own imported list is consulted. Nothing here (or anywhere) asks
 * LinkedIn about degrees of connection.
 */

export type KnownConnectionLite = {
  /** null for people known only from the Candidates list (connected there). */
  id: string | null;
  fullName: string;
  company: string | null;
  position: string | null;
  linkedinKey: string | null;
};

export type PersonForMatch = {
  fullName: string;
  currentCompany: string | null;
  currentTitle: string | null;
  linkedinKey: string | null;
  institutions: string[];
};

export type Override = { knownConnectionId: string | null; samePerson: boolean };

export type KnownMatch = { known: KnownConnectionLite; confidence: number; signals: string[] } | null;

export const AUTO_HIDE = 0.95;
export const ASK_USER = 0.75;

/** Where a confidence lands: hidden as already connected, shown for review, or kept as a candidate. */
export function matchBand(confidence: number): "auto_hidden" | "needs_review" | "none" {
  if (confidence >= AUTO_HIDE) return "auto_hidden";
  if (confidence >= ASK_USER) return "needs_review";
  return "none";
}

/**
 * The key that a user's "same person / not the same person" decision is stored
 * under, so it applies again when a later search finds this person.
 */
export function identitySignature(p: Pick<PersonForMatch, "fullName" | "linkedinKey" | "currentCompany">): string {
  return p.linkedinKey ? `li:${p.linkedinKey}` : `nm:${normalizeName(p.fullName)}|${normalizeCompany(p.currentCompany)}`;
}

function sameRole(a: string | null, b: string | null): boolean {
  const x = clean(a).trim().split(" ").filter((w) => w.length > 2);
  const y = new Set(clean(b).trim().split(" ").filter((w) => w.length > 2));
  if (!x.length || !y.size) return false;
  const overlap = x.filter((w) => y.has(w)).length;
  return overlap / Math.max(x.length, y.size) >= 0.6;
}

/** Scores one known connection against a person, from 0 (different) to 1 (certain). */
export function scoreKnownMatch(person: PersonForMatch, known: KnownConnectionLite): { confidence: number; signals: string[] } {
  if (person.linkedinKey && known.linkedinKey) {
    return person.linkedinKey === known.linkedinKey ? { confidence: 1, signals: ["linkedin url"] } : { confidence: 0, signals: ["different linkedin url"] };
  }
  const name = compareNames(person.fullName, known.fullName);
  if (name.kind === "different") return { confidence: 0, signals: [] };

  const company = sameCompany(person.currentCompany, known.company);
  const role = sameRole(person.currentTitle, known.position);
  // People often list their school as their "company" or in the headline.
  const school = person.institutions.some((i) => clean(`${known.company} ${known.position}`).includes(clean(i)));
  const signals = [`name:${name.kind}`];
  if (company) signals.push("company");
  if (company === false) signals.push("different company");
  if (role) signals.push("role");
  if (school) signals.push("education");

  if (name.kind === "exact") {
    if (company === true) return { confidence: 0.96, signals };
    // John Smith @ Amazon is not John Smith @ Microsoft.
    if (company === false) return { confidence: role ? 0.6 : 0.45, signals };
    if (role || school) return { confidence: 0.88, signals };
    return { confidence: 0.8, signals };
  }
  if (name.kind === "nickname") {
    if (company === true) return { confidence: 0.9, signals };
    if (company === false) return { confidence: 0.3, signals };
    return { confidence: role || school ? 0.78 : 0.6, signals };
  }
  // fuzzy
  if (company === true) return { confidence: 0.85, signals };
  return { confidence: company === false ? 0.2 : 0.5, signals };
}

/**
 * The best match among the user's known connections, after applying their own
 * past corrections for this person. Returns null when nobody comes close.
 */
export function matchKnownConnection(
  person: PersonForMatch,
  known: KnownConnectionLite[],
  overrides: Map<string, Override[]> = new Map(),
): KnownMatch {
  const decisions = overrides.get(identitySignature(person)) ?? [];
  const confirmed = decisions.find((d) => d.samePerson);
  if (confirmed) {
    const k = known.find((x) => x.id === confirmed.knownConnectionId);
    if (k) return { known: k, confidence: 1, signals: ["confirmed by you"] };
  }
  const rejected = new Set(decisions.filter((d) => !d.samePerson).map((d) => d.knownConnectionId));

  let top: KnownMatch = null;
  for (const k of known) {
    if (rejected.has(k.id)) continue;
    const s = scoreKnownMatch(person, k);
    if (s.confidence > 0 && (!top || s.confidence > top.confidence)) top = { known: k, ...s };
  }
  return top;
}
