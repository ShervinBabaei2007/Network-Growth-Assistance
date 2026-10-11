import { clean } from "@/lib/text/match";
import { compareNames } from "@/lib/text/names";

/**
 * Entity resolution: is this the same person we already have? Conservative by
 * design. A name alone never merges two records; it takes the name plus a
 * corroborating signal, and anything in between is only flagged as a possible duplicate.
 */

export type IdentityRecord = {
  fullName: string;
  currentCompany: string | null;
  institutions: string[];
  location: string | null;
  identityKeys: string[];
};

export const MERGE_THRESHOLD = 0.85;
export const POSSIBLE_DUPLICATE_THRESHOLD = 0.6;

const LEGAL_SUFFIXES = /\b(inc|incorporated|corp|corporation|ltd|limited|llc|co|company|technologies|technology|labs)\b/g;

/** "Amazon Web Services, Inc." and "amazon" compare as the same employer. */
export function normalizeCompany(name: string | null | undefined): string {
  return clean(name).replace(LEGAL_SUFFIXES, " ").replace(/\s+/g, " ").trim();
}

export function sameCompany(a: string | null | undefined, b: string | null | undefined): boolean | null {
  const x = normalizeCompany(a);
  const y = normalizeCompany(b);
  if (!x || !y) return null;
  if (x === y) return true;
  // "amazon web services" vs "amazon": one is a whole-word prefix of the other.
  return ` ${x} `.startsWith(` ${y} `) || ` ${y} `.startsWith(` ${x} `);
}

export function identitySimilarity(a: IdentityRecord, b: IdentityRecord): { score: number; signals: string[] } {
  const name = compareNames(a.fullName, b.fullName);
  if (name.kind === "different") return { score: 0, signals: [] };

  const signals: string[] = [`name:${name.kind}`];
  let score = name.kind === "exact" ? 0.5 : name.kind === "nickname" ? 0.4 : 0.35;

  const sharedKey = a.identityKeys.find((k) => b.identityKeys.includes(k));
  const keyConflict = ["github:", "linkedin:"].some((prefix) => {
    const ka = a.identityKeys.find((k) => k.startsWith(prefix));
    const kb = b.identityKeys.find((k) => k.startsWith(prefix));
    return ka && kb && ka !== kb;
  });
  if (keyConflict && !sharedKey) return { score: 0.1, signals: [...signals, "profile:conflict"] };
  if (sharedKey) {
    score += 0.5;
    signals.push(`profile:${sharedKey.split(":")[0]}`);
  }

  const company = sameCompany(a.currentCompany, b.currentCompany);
  if (company === true) {
    score += 0.25;
    signals.push("company");
  } else if (company === false) {
    score -= 0.2;
    signals.push("company:conflict");
  }

  if (a.institutions.some((i) => b.institutions.includes(i))) {
    score += 0.15;
    signals.push("institution");
  }
  if (a.location && b.location && clean(a.location).split(" ").filter((w) => w.length > 3).some((w) => clean(b.location).includes(` ${w} `))) {
    score += 0.05;
    signals.push("location");
  }
  return { score: Math.max(0, Math.min(1, Number(score.toFixed(3)))), signals };
}

export type ResolveDecision<T> = { kind: "merge"; into: T; score: number; signals: string[] } | { kind: "new"; possibleDuplicateOf: T | null; score: number };

/** Picks what to do with a newly found person given existing records with similar names. */
export function resolveIdentity<T extends IdentityRecord>(draft: IdentityRecord, existing: T[]): ResolveDecision<T> {
  let top: { rec: T; score: number; signals: string[] } | null = null;
  for (const rec of existing) {
    const s = identitySimilarity(draft, rec);
    if (!top || s.score > top.score) top = { rec, ...s };
  }
  if (top && top.score >= MERGE_THRESHOLD && top.signals.length >= 2) return { kind: "merge", into: top.rec, score: top.score, signals: top.signals };
  return { kind: "new", possibleDuplicateOf: top && top.score >= POSSIBLE_DUPLICATE_THRESHOLD ? top.rec : null, score: top?.score ?? 0 };
}
