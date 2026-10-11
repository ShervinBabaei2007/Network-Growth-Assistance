import { clean } from "./match";

/**
 * Finds the specific claims in a piece of writing (names, technologies, acronyms and
 * numbers) so they can be checked against a source. Matching is by whole words, so
 * "Java" is not found in "JavaScript".
 */

// Capitalized words that make no claim on their own.
const ALWAYS_OK = new Set(
  (
    "i i'm i'd i've i'll a an the my me we our you your it its this that these those he she they dear hiring manager team sincerely regards best thank thanks " +
    "api apis ui ux ok etc canada canadian english " +
    "january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec " +
    "monday tuesday wednesday thursday friday present current"
  ).split(" "),
);

const WORD = /[\p{L}\d][\p{L}\d+#.'’/-]*[\p{L}\d+#]|[\p{L}\d]/gu;

/** A token is a "term" if it is capitalized, an acronym, or contains digits or symbols (C++, Node.js, I2C). */
function isTerm(token: string): boolean {
  return /^\p{Lu}/u.test(token) || /[+#]/.test(token) || (/\d/.test(token) && /\p{L}/u.test(token)) || /\p{L}\.\p{L}/u.test(token);
}

/**
 * Terms in `text` that don't appear in `known`. Sentence-initial words are skipped
 * unless they're acronyms or contain symbols (a capitalized verb isn't a claim; "AWS" is).
 * Multi-word names pass if each word is known on its own.
 */
export function unknownTerms(text: string, known: string, allow: Iterable<string> = []): string[] {
  const knownClean = clean(known);
  const extra = new Set([...allow].map((a) => clean(a).trim()));
  const out = new Set<string>();
  const sentences = text.split(/(?<=[.!?:;])\s+|\n+/);
  for (const sentence of sentences) {
    const tokens = [...sentence.matchAll(WORD)].map((m) => m[0].replace(/[.'’-]+$/, "").replace(/['’]s$/, ""));
    tokens.forEach((token, i) => {
      if (!token || !isTerm(token)) return;
      const isAcronymOrSymbol = /^[\p{Lu}\d]{2,}$/u.test(token) || /[+#\d]/.test(token) || /\p{L}\.\p{L}/u.test(token);
      if (i === 0 && !isAcronymOrSymbol) return;
      const known = (t: string) => {
        const c = clean(t).trim();
        return !c || ALWAYS_OK.has(c) || ALWAYS_OK.has(t.toLowerCase()) || extra.has(c) || knownClean.includes(` ${c} `);
      };
      if (known(token)) return;
      // "Northwind-scale" or "Python-based": fine if each part that is a term is known.
      const parts = token.split("-").filter(Boolean);
      if (parts.length > 1 && parts.every((p) => !isTerm(p) || known(p))) return;
      out.add(token);
    });
  }
  return [...out];
}

/** Numbers that state a quantity: "40%", "3", "1.5", "$2M", "10x", "2,000". Years like 2023 are included. */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, "")).filter((n) => n.length > 0);
}

/** Numbers in `text` that don't occur in `source`. */
export function unknownNumbers(text: string, source: string): string[] {
  const have = new Set(numbersIn(source));
  return [...new Set(numbersIn(text).filter((n) => !have.has(n)))];
}
