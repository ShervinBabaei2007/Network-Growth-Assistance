/** Role nouns that mean the same job on different boards, in any field. */
const ROLE_SYNONYMS: string[][] = [
  ["developer", "engineer", "programmer"],
  ["technician", "technologist"],
  ["analyst", "specialist"],
  ["representative", "rep", "agent", "associate"],
  ["support", "service"],
  ["administrator", "admin"],
  ["assistant", "asst"],
  ["coordinator", "coord"],
  ["designer", "design"],
];

/**
 * Seniority words aren't required in a job title: the level filter handles seniority, and
 * most postings for a junior role don't say "Junior". ("Intern" and "co-op" stay: they're
 * the kind of job, often only said in the title.)
 */
const LEVEL_WORDS = new Set(["junior", "jr", "senior", "sr", "entry", "level", "mid", "intermediate", "experienced", "ii", "iii", "iv"]);

/** "Software development" means the job of a software developer. */
const asRole = (t: string) => t.replace(/\b(software|web|app|application|game|mobile|front[\s-]?end|back[\s-]?end|full[\s-]?stack)\s+development\b/gi, "$1 developer");

/**
 * Close variants of a searched title. "Full Stack Developer" also finds "Full-Stack
 * Engineer", "Fullstack Developer" and "Web Application Developer"; broader titles
 * ("Software Developer") are related but ranked below the exact ones (see rank.ts).
 */
const RELATED: { match: RegExp; related: string[]; broader: string[] }[] = [
  { match: /\bfull[\s-]?stack\b/i, related: ["fullstack developer", "web application developer"], broader: ["software developer", "web developer"] },
  { match: /\bfront[\s-]?end\b/i, related: ["frontend developer", "ui developer"], broader: ["web developer", "software developer"] },
  { match: /\bback[\s-]?end\b/i, related: ["backend developer", "api developer"], broader: ["software developer"] },
  { match: /\bsoftware (developer|engineer)\b/i, related: [], broader: ["application developer", "programmer"] },
  { match: /\bdata analyst\b/i, related: ["business intelligence analyst"], broader: ["analyst"] },
  { match: /\b(qa|quality assurance|test)\b/i, related: ["qa analyst", "test engineer", "qa engineer"], broader: [] },
  // Design
  { match: /\b(ux|ui|user experience|user interface|product design(er)?|interaction design(er)?)\b/i, related: ["ux designer", "ui designer", "product designer", "interaction designer", "ux researcher"], broader: ["designer"] },
  { match: /\b(graphic|visual) design(er)?\b/i, related: ["graphic designer", "visual designer", "brand designer"], broader: ["designer"] },
  // Retail, sales and service
  { match: /\b(retail|store|sales associate|cashier|shop assistant|merchandis)/i, related: ["retail associate", "sales associate", "store associate", "cashier", "retail sales", "merchandiser"], broader: ["sales"] },
  { match: /\b(sales (rep|representative|executive)|account executive|business development)\b/i, related: ["sales representative", "account executive", "business development representative", "inside sales"], broader: ["sales"] },
  { match: /\bcustomer (service|support|success|care|experience)\b/i, related: ["customer service representative", "customer support specialist", "customer success associate", "client services"], broader: ["support"] },
  { match: /\b(barista|server|waiter|waitress|cook|chef|host|hospitality|restaurant|front desk)\b/i, related: ["barista", "server", "line cook", "host", "front desk agent"], broader: ["hospitality"] },
  { match: /\b(warehouse|logistics|shipping|receiving|forklift|delivery driver)\b/i, related: ["warehouse associate", "logistics coordinator", "shipping receiver", "material handler"], broader: ["warehouse"] },
  // Office, business and people
  { match: /\bmarketing\b/i, related: ["marketing coordinator", "marketing specialist", "digital marketing", "content marketing"], broader: ["marketing"] },
  { match: /\b(accountant|accounting|bookkeep|payroll)/i, related: ["accountant", "bookkeeper", "accounting clerk", "payroll"], broader: ["finance"] },
  { match: /\b(administrative|office assistant|receptionist|executive assistant|office manager)\b/i, related: ["administrative assistant", "office assistant", "receptionist", "office coordinator"], broader: ["assistant"] },
  { match: /\b(recruit|talent acquisition|human resources|hr)\b/i, related: ["recruiter", "talent acquisition", "hr coordinator", "people operations"], broader: ["hr"] },
  { match: /\b(project|program) manager\b/i, related: ["project manager", "program manager", "project coordinator"], broader: [] },
  // Health and education
  { match: /\b(nurse|nursing)\b/i, related: ["registered nurse", "practical nurse", "nurse"], broader: ["healthcare"] },
  { match: /\b(teacher|tutor|instructor|educator)\b/i, related: ["teacher", "tutor", "instructor", "educator"], broader: ["education"] },
];

/** The searched title plus its close variants (related) and broader titles. */
export function relatedTitles(title: string): { related: string[]; broader: string[] } {
  const hits = RELATED.filter((r) => r.match.test(title));
  return { related: [...new Set(hits.flatMap((h) => h.related))], broader: [...new Set(hits.flatMap((h) => h.broader))] };
}

const STOP = ["and", "or", "the", "of", "for", "in", "a"];
/** Words as the database indexes them ("fullstack" stays one word). */
const rawWords = (t: string) =>
  t
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.includes(w));
/** Words for comparing titles: "Full-Stack", "Fullstack" and "Full Stack" are the same. */
const words = (t: string) => rawWords(asRole(t).toLowerCase().replace(/full[\s-]?stack/g, "full stack"));
/** A searched title's words without seniority words (all of them, if that's all it has). */
const searchWords = (t: string) => {
  const all = words(t);
  const kept = all.filter((w) => !LEVEL_WORDS.has(w));
  return kept.length ? kept : all;
};

/**
 * "Junior Software Developer" → "software:A & (developer:A | engineer:A | programmer:A)".
 * ":A" matches the job title only (the index also holds the department, and a Data Analyst
 * in "Engineering" isn't an engineer). Seniority words are left out (see LEVEL_WORDS).
 */
function titleTerm(t: string): string {
  const all = rawWords(asRole(t));
  const kept = all.filter((w) => !LEVEL_WORDS.has(w));
  return (kept.length ? kept : all)
    .map((w) => {
      const group = ROLE_SYNONYMS.find((g) => g.includes(w));
      return group ? `(${group.map((x) => `${x}:A`).join(" | ")})` : `${w}:A`;
    })
    .join(" & ");
}

/**
 * A full-text query for the titles to search, ORed: each title, its role synonyms and its
 * close variants. Broader titles aren't included, so they can't crowd out the search.
 */
export function titleQuery(titles: string[]): string | null {
  const all = titles.flatMap((t) => [t, ...relatedTitles(t).related]);
  const parts = [...new Set(all.map(titleTerm).filter(Boolean))];
  return parts.length ? parts.map((p) => `(${p})`).join(" | ") : null;
}

/** How similar a job title is to the searched titles: 1 exact, 0.8 a close variant, 0.5 broader, less for partial overlap. */
export function titleSimilarity(jobTitle: string, searched: string[]): number {
  if (!searched.length) return 0.5;
  const job = new Set(words(jobTitle).map((w) => ROLE_SYNONYMS.find((g) => g.includes(w))?.[0] ?? w));
  let best = 0;
  for (const s of searched) {
    const q = searchWords(s).map((w) => ROLE_SYNONYMS.find((g) => g.includes(w))?.[0] ?? w);
    if (q.length && q.every((w) => job.has(w))) best = Math.max(best, 1);
    const { related, broader } = relatedTitles(s);
    for (const r of related) if (words(r).every((w) => job.has(ROLE_SYNONYMS.find((g) => g.includes(w))?.[0] ?? w))) best = Math.max(best, 0.8);
    for (const r of broader) if (words(r).every((w) => job.has(ROLE_SYNONYMS.find((g) => g.includes(w))?.[0] ?? w))) best = Math.max(best, 0.5);
    if (q.length) best = Math.max(best, (q.filter((w) => job.has(w)).length / q.length) * 0.45);
  }
  return best;
}

/** How far back a search looks. */
export const RANGES = [
  { key: "1d", label: "24 hours", heading: "the last 24 hours", hours: 24 },
  { key: "3d", label: "3 days", heading: "the last 3 days", hours: 24 * 3 },
  { key: "7d", label: "7 days", heading: "the last 7 days", hours: 24 * 7 },
  { key: "14d", label: "14 days", heading: "the last 14 days", hours: 24 * 14 },
  { key: "30d", label: "30 days", heading: "the last 30 days", hours: 24 * 30 },
  // Every open posting, however old, including board jobs whose posting date is unknown.
  { key: "any", label: "Any time", heading: "any date", hours: Number.POSITIVE_INFINITY },
] as const;
export type Range = (typeof RANGES)[number];
export type RangeKey = Range["key"];

/** The range a URL asks for, or null when it doesn't (the search then widens on its own). */
export function parseRange(value: string | undefined): Range | null {
  return RANGES.find((r) => r.key === value) ?? null;
}

export const rangeSince = (range: Range, now = Date.now()) => (Number.isFinite(range.hours) ? new Date(now - range.hours * 3600_000) : new Date(0)).toISOString();

/** Whether a job falls in a window. Jobs with an unknown posting date count only for "any time". */
export const inRange = (j: { posted_at: string; date_source: string }, range: Range, now = Date.now()) =>
  !Number.isFinite(range.hours) || (j.date_source !== "unknown" && j.posted_at >= rangeSince(range, now));

/**
 * The automatic order when the user hasn't chosen a range: the last week, then the last
 * month, then every open posting. Open jobs stay relevant after a week (as on LinkedIn or
 * Google Jobs); ranking already puts the newest close matches first.
 */
export const AUTO_LADDER: RangeKey[] = ["7d", "30d", "any"];
/** Fewer verified results than this in a window widens the search to the next one. */
export const ENOUGH_RESULTS = 100;

/**
 * Picks the window to show when the user didn't choose one: the shortest on the ladder
 * with enough verified results, else the widest. Counts are of verified results only.
 */
export function chooseRange(countWithin: (r: Range) => number, explicit: Range | null): { range: Range; expandedFrom: Range | null; firstCount: number } {
  if (explicit) return { range: explicit, expandedFrom: null, firstCount: countWithin(explicit) };
  const ladder = AUTO_LADDER.map((k) => RANGES.find((r) => r.key === k)!);
  const firstCount = countWithin(ladder[0]);
  for (const r of ladder) if (countWithin(r) >= ENOUGH_RESULTS) return { range: r, expandedFrom: r === ladder[0] ? null : ladder[0], firstCount };
  const widest = ladder[ladder.length - 1];
  return { range: widest, expandedFrom: widest === ladder[0] ? null : ladder[0], firstCount };
}

/** "Only 4 verified jobs were found in the last 24 hours, so the search was expanded to the last 7 days." */
export function expansionNotice(firstCount: number, from: Range, to: Range): string {
  return `Only ${firstCount} verified job${firstCount === 1 ? " was" : "s were"} found in ${from.heading}, so the search was expanded to ${to.heading}.`;
}
