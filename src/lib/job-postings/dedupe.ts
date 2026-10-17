import { clean } from "@/lib/text/match";
import { normalizeTitle } from "./normalize";

/**
 * The same job can reach us from an employer's board, from Jobicy, Remotive or Adzuna, and
 * from a paste. These
 * pure functions decide when two rows are one job, and which link to show for it.
 * Merging happens when results are shown; rows in the database are never merged.
 */

const LEGAL_SUFFIX = / (inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|plc|gmbh|ulc|canada)$/;

/** "Acme Software Canada Inc." → "acme software". */
export function normCompany(name: string | null | undefined): string {
  let c = clean(name).trim();
  for (let i = 0; i < 3 && LEGAL_SUFFIX.test(c); i++) c = c.replace(LEGAL_SUFFIX, "").trim();
  return c;
}

/** Company, normalized title and place. Two jobs with different keys are never merged. */
export function jobDedupeKey(p: { company: string | null; title: string; city: string | null; province: string | null; remote: boolean }): string {
  const place = clean(p.city).trim() || (p.province ?? "").toLowerCase() || (p.remote ? "remote" : "");
  return `${normCompany(p.company)}|${normalizeTitle(p.title)}|${place}`.slice(0, 700);
}

/** 32-bit FNV-1a with a chosen offset basis; two bases give the two halves of a 64-bit hash. */
function fnv32(s: string, basis: number): number {
  let h = basis;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A 64-bit simhash of a description over word triples, as 16 hex digits. Null when too short to compare. */
export function simhash64(text: string | null | undefined): string | null {
  const words = clean(text).trim().split(" ").filter(Boolean);
  if (words.length < 12) return null;
  const weights = new Array<number>(64).fill(0);
  for (let i = 0; i + 2 < words.length; i++) {
    const shingle = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    const halves = [fnv32(shingle, 0x811c9dc5), fnv32(shingle, 0x050c5d1f)];
    for (let b = 0; b < 64; b++) weights[b] += (halves[b >> 5] >>> (b & 31)) & 1 ? 1 : -1;
  }
  const halves = [0, 0];
  for (let b = 0; b < 64; b++) if (weights[b] > 0) halves[b >> 5] |= 1 << (b & 31);
  return halves.map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
}

const popcount = (x: number) => {
  let n = 0;
  for (let v = x >>> 0; v; v >>>= 1) n += v & 1;
  return n;
};

export function hamming(a: string, b: string): number {
  return popcount(parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) + popcount(parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16));
}

/** Fingerprints this close mean the same text with small edits (tracking lines, a changed date). */
export const SAME_DESCRIPTION_MAX_DISTANCE = 10;
/** A job reposted within this window with a partial description can still be the same job. */
const PARTIAL_WINDOW_MS = 3 * 24 * 3600_000;

export type DedupeItem = {
  id: string;
  source: "ats" | "adzuna" | "jobicy" | "remotive" | "arbeitnow" | "usajobs" | "careerjet" | "manual";
  dedupe_key: string | null;
  desc_fingerprint: string | null;
  description_is_partial: boolean;
  canonical_url: string | null;
  apply_url: string | null;
  posted_at: string;
  verification_status: string;
  /** The employer's own site (not an ATS or job board) hosts the link. */
  employerHosted?: boolean;
};

/** "company|title" of a dedupe key, without the place. */
const companyTitle = (key: string | null) => (key ? key.slice(0, key.lastIndexOf("|")) : null);

const sameFullText = (a: DedupeItem, b: DedupeItem) =>
  Boolean(a.desc_fingerprint && b.desc_fingerprint && !a.description_is_partial && !b.description_is_partial) && hamming(a.desc_fingerprint!, b.desc_fingerprint!) <= SAME_DESCRIPTION_MAX_DISTANCE;

/**
 * Whether two rows are the same posting. Same company+title+place alone is not enough when
 * both descriptions differ. Remote-job sites (Jobicy, Remotive) list no city, so a copy of
 * a board job there can have a different place: same company and title with the same full
 * description is enough in that case.
 */
export function sameJob(a: DedupeItem, b: DedupeItem): boolean {
  if (a.canonical_url && a.canonical_url === b.canonical_url) return true;
  if (!a.dedupe_key || !b.dedupe_key) return false;
  if (a.dedupe_key !== b.dedupe_key) return companyTitle(a.dedupe_key) === companyTitle(b.dedupe_key) && sameFullText(a, b);
  if (a.desc_fingerprint && b.desc_fingerprint && !a.description_is_partial && !b.description_is_partial) return sameFullText(a, b);
  // One side has only a snippet (or no description): trust the key when they appeared close together.
  return Math.abs(Date.parse(a.posted_at) - Date.parse(b.posted_at)) <= PARTIAL_WINDOW_MS;
}

/**
 * After the employer's own site: its board, or the government's own announcement (USAJOBS
 * is the employer's site for federal jobs); then job sites: Jobicy, Remotive, Arbeitnow,
 * Adzuna; then a paste.
 */
const SOURCE_RANK: Record<DedupeItem["source"], number> = { ats: 1, usajobs: 1, jobicy: 2, remotive: 3, arbeitnow: 4, adzuna: 5, careerjet: 5, manual: 6 };

/**
 * Which copy of a job to show: verified first, then the most direct link —
 * the employer's own site, then its ATS posting, then a job board's listing, then a paste.
 */
export function linkRank(x: DedupeItem): number {
  const verified = x.verification_status === "verified" ? 0 : 10;
  const kind = x.source === "ats" && x.employerHosted ? 0 : SOURCE_RANK[x.source];
  return verified + kind + (x.apply_url ? 0 : 20);
}

export type Merged<T> = { job: T; duplicates: T[] };

/** Groups duplicates, keeping the input order of each group's best copy. */
export function dedupeJobs<T extends DedupeItem>(items: T[]): Merged<T>[] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const buckets = new Map<string, number[]>();
  items.forEach((it, i) => {
    for (const k of [it.dedupe_key && `k:${it.dedupe_key}`, it.dedupe_key && `t:${companyTitle(it.dedupe_key)}`, it.canonical_url && `u:${it.canonical_url}`]) {
      if (!k) continue;
      const list = buckets.get(k) ?? [];
      for (const j of list) if (find(i) !== find(j) && sameJob(items[i], items[j])) parent[find(i)] = find(j);
      list.push(i);
      buckets.set(k, list);
    }
  });
  const groups = new Map<number, number[]>();
  items.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const merged = [...groups.values()].map((idx) => {
    const sorted = [...idx].sort((a, b) => linkRank(items[a]) - linkRank(items[b]) || a - b);
    return { first: Math.min(...idx), m: { job: items[sorted[0]], duplicates: sorted.slice(1).map((i) => items[i]) } };
  });
  return merged.sort((a, b) => a.first - b.first).map((x) => x.m);
}
