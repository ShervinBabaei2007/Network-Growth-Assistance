/**
 * Person-name normalization and fuzzy comparison for identity resolution and
 * connection dedupe. Names alone are weak evidence: callers combine these scores
 * with employer, school or profile signals before treating two records as one person.
 */

const HONORIFICS = new Set(["dr", "prof", "professor", "mr", "mrs", "ms", "mx", "miss", "sir", "eng", "ing"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "msc", "mba", "meng", "masc", "basc", "beng", "bsc", "peng", "eit", "cpa", "pmp"]);

function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * The name's comparable tokens: accents folded, honorifics, degree suffixes,
 * parentheticals, emoji and middle initials removed, and "Last, First" reordered.
 */
export function nameTokens(fullName: string): string[] {
  let text = fold(fullName)
    .replace(/\([^)]*\)|\[[^\]]*\]|"[^"]*"/g, " ")
    // Credentials after a comma ("Jane Doe, P.Eng.") are suffixes, not a surname.
    .replace(/,\s*(p\.?\s?eng|ph\.?\s?d|m\.?\s?sc|b\.?\s?a\.?\s?sc|eit|mba|cpa)\.?\b.*$/i, " ");

  // "Doe, Jane" → "Jane Doe" (a single comma with words on both sides).
  const comma = text.split(",");
  if (comma.length === 2 && comma[0].trim() && comma[1].trim()) text = `${comma[1]} ${comma[0]}`;

  const tokens = text
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .filter((t) => !HONORIFICS.has(t) && !SUFFIXES.has(t));

  // Drop middle initials but keep a lone initial if it's all there is.
  if (tokens.length > 2) return [tokens[0], ...tokens.slice(1, -1).filter((t) => t.length > 1), tokens[tokens.length - 1]];
  return tokens;
}

/** The dedupe key: first and last comparable token, e.g. "Dr. Alex J. Chen, P.Eng." → "alex chen". */
export function normalizeName(fullName: string): string {
  const t = nameTokens(fullName);
  if (t.length === 0) return "";
  if (t.length === 1) return t[0];
  return `${t[0]} ${t[t.length - 1]}`;
}

/** First and last name as written (accents kept), for display and CSV splitting. */
export function splitName(fullName: string): { first: string | null; last: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts[parts.length - 1] };
}

// A few common English nicknames. Used only as a weak signal, never to merge on its own.
const NICKNAMES: Record<string, string> = {
  alex: "alexander", al: "alexander", sasha: "alexander",
  andy: "andrew", drew: "andrew",
  ben: "benjamin",
  bob: "robert", rob: "robert", robbie: "robert", bobby: "robert",
  bill: "william", will: "william", liam: "william",
  chris: "christopher",
  dan: "daniel", danny: "daniel",
  dave: "david",
  jim: "james", jimmy: "james", jamie: "james",
  jon: "jonathan", john: "john", johnny: "john",
  joe: "joseph",
  kate: "katherine", katie: "katherine", kathy: "katherine", cathy: "catherine",
  liz: "elizabeth", beth: "elizabeth",
  matt: "matthew",
  mike: "michael",
  nick: "nicholas",
  pat: "patrick",
  sam: "samuel",
  steve: "steven",
  tom: "thomas",
  tony: "anthony",
  vicky: "victoria",
};

const canonicalFirst = (t: string) => NICKNAMES[t] ?? t;

/** Jaro-Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a.length ? 1 : 0;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array<boolean>(a.length).fill(false);
  const bMatch = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(b.length, i + window + 1); j++) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = bMatch[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

export type NameMatch = "exact" | "nickname" | "fuzzy" | "different";

/**
 * Compares two names. "exact" means the same first and last token after
 * normalization; "nickname" means Alex/Alexander-style first names with the same
 * surname; "fuzzy" means a likely typo or transliteration (JW ≥ 0.92 on both parts).
 */
export function compareNames(a: string, b: string): { kind: NameMatch; score: number } {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return { kind: "different", score: 0 };
  if (na === nb) return { kind: "exact", score: 1 };

  const [fa, ...ra] = na.split(" ");
  const [fb, ...rb] = nb.split(" ");
  const la = ra.join(" ");
  const lb = rb.join(" ");
  if (la && la === lb && canonicalFirst(fa) === canonicalFirst(fb)) return { kind: "nickname", score: 0.93 };

  const first = jaroWinkler(fa, fb);
  const last = la && lb ? jaroWinkler(la, lb) : 0;
  const score = Math.min(first, last);
  if (la && lb && first >= 0.92 && last >= 0.92) return { kind: "fuzzy", score };
  return { kind: "different", score };
}
