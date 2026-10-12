import { COMPANY_ALIASES } from "@/lib/discovery/criteria";
import { clean } from "@/lib/text/match";

/**
 * Is this person's employer the same company as this job's? Used to show "People at
 * {company}". Only an exact match (after legal suffixes) or a pair the user confirmed
 * counts by itself. Anything looser ("Amazon" and "Amazon Canada", or a brand of the same
 * group) is only *possible*, and the user decides; their answer is remembered per user.
 *
 * This is separate from the job dedupe key (dedupe.ts normCompany), which must not change.
 */

export type MatchLevel = "same" | "alias" | "possible" | "different";
export type CompanyMatch = { level: MatchLevel; reason: string };
export type AliasDecision = { aKey: string; bKey: string; decision: "same" | "different" };

const LEGAL = / (inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|plc|gmbh|ulc|sa|ag|bv|pty|srl|sas)$/;
const REGIONAL = / (canada|usa|us|uk|europe|emea|apac|north america|americas|global|international|worldwide)$/;

function strip(re: RegExp, key: string): string {
  let k = key;
  for (let i = 0; i < 3 && re.test(k); i++) k = k.replace(re, "").trim();
  return k;
}

/** "Acme Software, Inc." → "acme software". Empty for a missing name. */
export function companyKey(name: string | null | undefined): string {
  return strip(LEGAL, clean(name).trim());
}

/** Without regional suffixes too: "Amazon Canada Inc." → "amazon". */
const baseKey = (key: string) => strip(LEGAL, strip(REGIONAL, key));

/** The two keys in a fixed order, so a decision is found whichever way round it's asked. */
export function pairKey(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

function familyOf(key: string): string | null {
  for (const [family, names] of Object.entries(COMPANY_ALIASES)) if (names.includes(key) || family === key) return family;
  return null;
}

/** A URL-safe slug for a company page. */
export const companySlug = (name: string) => companyKey(name).replace(/ /g, "-");
export const keyFromSlug = (slug: string) => decodeURIComponent(slug).toLowerCase().replace(/[^a-z0-9+-]/g, "").replace(/-+/g, " ").trim();

export function matchCompany(a: string | null | undefined, b: string | null | undefined, decisions: AliasDecision[] = []): CompanyMatch {
  const ka = companyKey(a);
  const kb = companyKey(b);
  if (!ka || !kb) return { level: "different", reason: "A company name is missing" };
  if (ka === kb) return { level: "same", reason: "Same company name" };
  const [x, y] = pairKey(ka, kb);
  const decided = decisions.find((d) => d.aKey === x && d.bKey === y);
  if (decided?.decision === "same") return { level: "alias", reason: "You confirmed these are the same company" };
  if (decided?.decision === "different") return { level: "different", reason: "You said these are different companies" };
  const ba = baseKey(ka);
  const bb = baseKey(kb);
  if (ba && ba === bb) return { level: "possible", reason: "The same name apart from a regional part (like “Canada”)" };
  const fa = familyOf(ba);
  if (fa && fa === familyOf(bb)) return { level: "possible", reason: `Both are names used by ${fa[0].toUpperCase()}${fa.slice(1)}` };
  const [short, long] = ba.length <= bb.length ? [ba, bb] : [bb, ba];
  if (short.length >= 3 && long.startsWith(`${short} `)) return { level: "possible", reason: "One name starts with the other" };
  return { level: "different", reason: "Different company names" };
}

export const counts = (m: CompanyMatch) => m.level === "same" || m.level === "alias";
