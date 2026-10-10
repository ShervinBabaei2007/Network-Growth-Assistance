import type { Discipline, University } from "@/lib/domain";

export type Confidence = "confirmed" | "needs_review";

export type Classified<T> = { value: T | null; confidence: Confidence; reason: string };

/** Lowercase, unify "&"/punctuation and collapse spaces so aliases match reliably. */
function clean(text: string | null | undefined): string {
  return ` ${(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim()} `;
}

/** True if `phrase` occurs in the cleaned text as whole words. */
const has = (text: string, phrase: string) => text.includes(` ${phrase} `);
const hasAny = (text: string, phrases: readonly string[]) => phrases.some((p) => has(text, p));

// ---------------------------------------------------------------- universities

const UNIVERSITY_ALIASES: Record<University, readonly string[]> = {
  uoft: [
    "university of toronto",
    "u of t",
    "uoft",
    "utoronto",
    "utsc",
    "utm",
    "u of t scarborough",
    "u of t mississauga",
  ],
  ubc: ["university of british columbia", "ubc", "ubc vancouver"],
  sfu: ["simon fraser university", "simon fraser", "sfu"],
  waterloo: ["university of waterloo", "uwaterloo", "uw waterloo"],
};

const UBCO_ALIASES = ["ubc okanagan", "ubco", "university of british columbia okanagan"];

// Names that contain a target school's words but are a different institution.
const LOOKALIKES = ["toronto metropolitan", "wilfrid laurier", "waterloo region", "conestoga"];

export function classifyUniversity(
  text: string | null | undefined,
  { countUbcoAsUbc = true }: { countUbcoAsUbc?: boolean } = {},
): Classified<University> {
  const t = clean(text);
  if (!t.trim()) return { value: null, confidence: "needs_review", reason: "No school given." };

  const found = new Set<University>();
  for (const [u, aliases] of Object.entries(UNIVERSITY_ALIASES) as [University, readonly string[]][]) {
    if (hasAny(t, aliases)) found.add(u);
  }

  if (hasAny(t, UBCO_ALIASES)) {
    if (countUbcoAsUbc) found.add("ubc");
    else if (found.size === 1 && found.has("ubc")) {
      return { value: null, confidence: "needs_review", reason: "UBC Okanagan isn't counted as UBC in your settings." };
    }
  }

  if (found.size > 1) {
    return { value: null, confidence: "needs_review", reason: "Mentions more than one target school." };
  }
  if (found.size === 1) {
    const [u] = found;
    return { value: u, confidence: "confirmed", reason: "Matched the school name." };
  }

  if (hasAny(t, LOOKALIKES)) {
    return { value: null, confidence: "needs_review", reason: "A different school with a similar name." };
  }
  if (has(t, "waterloo")) {
    return { value: null, confidence: "needs_review", reason: "Says “Waterloo” but not clearly the University of Waterloo." };
  }
  if (has(t, "toronto")) {
    return { value: null, confidence: "needs_review", reason: "Says “Toronto” but not clearly the University of Toronto." };
  }
  return { value: null, confidence: "needs_review", reason: "Not one of the four target schools." };
}

// ---------------------------------------------------------------- disciplines

const DISCIPLINE_ALIASES: Record<Discipline, readonly string[]> = {
  ce: ["computer engineering", "computer eng", "comp eng", "compe", "cpen", "cpe"],
  ee: ["electrical engineering", "electrical eng", "elec eng", "electronics engineering", "electrical"],
  mech: ["mechatronics", "mechatronic", "mechatronics engineering", "mechatronic systems engineering", "mechatronics option"],
  cs: ["computer science", "computing science", "comp sci", "compsci", "cpsc", "cmpt", "bcs", "cs"],
};

// Program names that span more than one target discipline.
const AMBIGUOUS_PROGRAMS = [
  "electrical and computer engineering",
  "electrical computer engineering",
  "ece",
  "e and ce",
  "engineering science",
  "engsci",
  "ensc",
];

// Course codes and abbreviations that are only meaningful at one school.
const SCHOOL_SPECIFIC: { alias: string; discipline: Discipline; university: University }[] = [
  { alias: "elec", discipline: "ee", university: "ubc" },
  { alias: "mse", discipline: "mech", university: "sfu" },
];

export function classifyDiscipline(
  text: string | null | undefined,
  university: University | null = null,
): Classified<Discipline> {
  let t = clean(text);
  if (!t.trim()) return { value: null, confidence: "needs_review", reason: "No program given." };

  if (has(t, "minor")) {
    return { value: null, confidence: "needs_review", reason: "Mentions a minor; confirm the major." };
  }

  const hadAmbiguous = hasAny(t, AMBIGUOUS_PROGRAMS);
  for (const phrase of AMBIGUOUS_PROGRAMS) t = t.split(` ${phrase} `).join(" ");

  const found = new Set<Discipline>();
  for (const [d, aliases] of Object.entries(DISCIPLINE_ALIASES) as [Discipline, readonly string[]][]) {
    if (hasAny(t, aliases)) found.add(d);
  }
  for (const s of SCHOOL_SPECIFIC) {
    if (university === s.university && has(t, s.alias)) found.add(s.discipline);
  }
  if (found.size === 1) {
    const [d] = found;
    return { value: d, confidence: "confirmed", reason: "Matched the program name." };
  }
  if (found.size > 1) {
    return { value: null, confidence: "needs_review", reason: "Mentions more than one target program." };
  }
  if (hadAmbiguous) {
    return { value: null, confidence: "needs_review", reason: "The program covers more than one discipline (for example ECE or Engineering Science)." };
  }
  if (has(t, "mechanical engineering") || has(t, "mechanical")) {
    return { value: null, confidence: "needs_review", reason: "Mechanical engineering only counts if the Mechatronics option is stated." };
  }
  if (has(t, "software engineering")) {
    return { value: null, confidence: "needs_review", reason: "Software engineering is related but not a target program; decide manually." };
  }
  return { value: null, confidence: "needs_review", reason: "Not one of the four target programs." };
}

/** Classifies both fields; the discipline check can use the school for course codes. */
export function classifyCandidate(
  schoolText: string | null | undefined,
  programText: string | null | undefined,
  opts?: { countUbcoAsUbc?: boolean },
) {
  const university = classifyUniversity(schoolText, opts);
  const discipline = classifyDiscipline(programText, university.value);
  return { university, discipline };
}
