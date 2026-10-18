/** Helpers for the command palette's search. Pure, so they can be tested without a database. */

export const PALETTE_MIN_QUERY = 2;
export const PALETTE_PER_TYPE = 8;

export type PaletteHit = { id: string; label: string; detail?: string; href: string };
export type PaletteResults = {
  candidates: PaletteHit[];
  people: PaletteHit[];
  applications: PaletteHit[];
  jobs: PaletteHit[];
};

/** The text to search for, trimmed and cut to a sensible length, or null when it is too short to search. */
export function cleanQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return q.length >= PALETTE_MIN_QUERY ? q : null;
}

/** Escapes the characters that mean something in a SQL LIKE pattern, so "50%" searches for "50%". */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * The text of a PostgREST `or` filter matching any of the columns. Commas, parentheses and quotes would
 * change the filter's meaning, so they are dropped (they never matter when searching names or titles).
 */
export function orIlike(columns: string[], q: string): string {
  const safe = escapeLike(q.replace(/[,()"']/g, " ").replace(/\s+/g, " ").trim());
  return columns.map((c) => `${c}.ilike.%${safe}%`).join(",");
}
