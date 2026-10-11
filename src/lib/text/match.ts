/** Lowercase, unify "&"/punctuation and collapse spaces so aliases match reliably. Padded with spaces. */
export function clean(text: string | null | undefined): string {
  return ` ${(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim()} `;
}

/** True if `phrase` occurs in the cleaned text as whole words. */
export const has = (text: string, phrase: string) => text.includes(` ${phrase} `);
export const hasAny = (text: string, phrases: readonly string[]) => phrases.some((p) => has(text, p));
