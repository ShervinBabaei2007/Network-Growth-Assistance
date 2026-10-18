/**
 * Keyboard shortcuts, kept free of React and the DOM so the rules can be unit-tested. Shortcuts never fire
 * while someone is typing, and the page chords are "g" followed by a letter (like GitHub and Gmail).
 */

export const PAGE_SHORTCUTS = [
  { key: "o", href: "/overview", label: "Overview" },
  { key: "d", href: "/discover", label: "Discover" },
  { key: "j", href: "/jobs", label: "Jobs" },
  { key: "q", href: "/queue", label: "Daily Queue" },
  { key: "c", href: "/candidates", label: "Candidates" },
  { key: "f", href: "/follow-ups", label: "Follow-ups" },
  { key: "p", href: "/people", label: "People" },
  { key: "k", href: "/connections", label: "Connections" },
  { key: "a", href: "/applications", label: "Applications" },
  { key: "n", href: "/notifications", label: "Notifications" },
  { key: "s", href: "/settings", label: "Settings" },
  { key: "h", href: "/help", label: "Help" },
] as const;

/** How long after "g" the next letter still counts, in milliseconds. */
export const CHORD_WINDOW_MS = 1200;

type Target = { tagName?: string; isContentEditable?: boolean } | null | undefined;

/** True when the key press is going into a field, so a shortcut must not take it. */
export function isTypingTarget(target: Target): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** The page a "g" chord leads to for this letter, if any. */
export function pageForChord(key: string): string | null {
  return PAGE_SHORTCUTS.find((s) => s.key === key.toLowerCase())?.href ?? null;
}

export type Intent = "search" | "shortcuts" | "chord-start" | null;

/**
 * What a key press means, given what is going on. Ctrl/Cmd+K always opens the palette (it is safe in a field);
 * "/", "?" and "g" only when nothing is being typed and no other dialog is open.
 */
export function intentFor(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, context: { typing: boolean; dialogOpen: boolean }): Intent {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") return "search";
  if (e.ctrlKey || e.metaKey || e.altKey || context.typing || context.dialogOpen) return null;
  if (e.key === "/") return "search";
  if (e.key === "?") return "shortcuts";
  if (e.key === "g") return "chord-start";
  return null;
}
