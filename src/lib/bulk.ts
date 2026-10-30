/** Small pure helpers shared by the bulk actions, kept here so they can be unit tested. */

export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

/** One tag as the single-row form would store it: trimmed and capped. Empty means "not a tag". */
export function cleanTag(raw: string): string {
  return raw.trim().slice(0, MAX_TAG_LENGTH);
}

/** Adds a tag unless it is already there (case-insensitive) or the list is full. Returns the same array when nothing changes. */
export function withTag(tags: readonly string[], tag: string): readonly string[] {
  if (!tag || tags.length >= MAX_TAGS) return tags;
  if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}

/** Removes a tag (case-insensitive). Returns the same array when it was not there. */
export function withoutTag(tags: readonly string[], tag: string): readonly string[] {
  const next = tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
  return next.length === tags.length ? tags : next;
}

/** Groups ids by a value so one update per distinct previous value can restore them. */
export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K, id: (row: T) => string): Map<K, string[]> {
  const out = new Map<K, string[]>();
  for (const row of rows) {
    const k = key(row);
    out.set(k, [...(out.get(k) ?? []), id(row)]);
  }
  return out;
}
