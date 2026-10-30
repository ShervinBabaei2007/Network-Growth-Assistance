/**
 * Drafts of what someone was typing, kept in the browser (localStorage) per record so a crashed tab or an
 * accidental close does not lose a half-written note. Never sent anywhere. Every access is wrapped because
 * storage can be blocked or full; the app works the same without it. Pure apart from the storage passed in, so
 * the rules are unit-tested.
 */

export type DraftStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIX = "draft:";
/** A draft older than this is stale and ignored. */
export const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Drafts longer than this are not kept (a note is far shorter; this stops storage filling up). */
export const DRAFT_MAX_CHARS = 20_000;

export const draftKey = (scope: string, id: string) => `${PREFIX}${scope}:${id}`;

export function browserStore(): DraftStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** True when what is typed differs from what is saved, ignoring surrounding whitespace. */
export const isDirty = (current: string, saved: string) => current.trim() !== saved.trim();

export function saveDraft(key: string, value: string, store: DraftStore | null = browserStore(), now = Date.now()): void {
  if (!store || value.length > DRAFT_MAX_CHARS) return;
  try {
    store.setItem(key, JSON.stringify({ v: value, t: now }));
  } catch {
    // Storage full or blocked: skip silently.
  }
}

/** The stored draft, or null when there is none, it is stale, or it cannot be read. */
export function loadDraft(key: string, store: DraftStore | null = browserStore(), now = Date.now()): string | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { v, t } = parsed as { v?: unknown; t?: unknown };
    if (typeof v !== "string" || typeof t !== "number" || now - t > DRAFT_MAX_AGE_MS || t > now + 60_000) {
      store.removeItem(key);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function clearDraft(key: string, store: DraftStore | null = browserStore()): void {
  try {
    store?.removeItem(key);
  } catch {
    // ignore
  }
}

/** A form's text fields as one string, so a whole form can be kept as a single draft. Skips secrets and files. */
export function serializeFields(fields: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))));
}

export function parseFields(raw: string): Record<string, string> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return null;
  }
}
