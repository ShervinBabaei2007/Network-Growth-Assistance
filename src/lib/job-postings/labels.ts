import { ANYWHERE, countryName } from "@/lib/geo/countries";
import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export const TIER_LABELS: Record<Enums["job_fit_tier"], string> = {
  strong: "Strong match",
  good: "Good match",
  stretch: "Stretch",
  excluded: "Doesn't qualify",
};

export const STATUS_LABELS: Record<Enums["job_user_status"], string> = {
  saved: "Saved",
  applied: "Applied",
  dismissed: "Dismissed",
};

export const WORK_AUTH_LABELS = {
  citizen: "Citizen",
  permanent_resident: "Permanent resident",
  work_permit: "Work permit (open or employer-specific)",
  needs_sponsorship: "I need visa sponsorship",
  unknown: "Prefer not to say",
} as const;

/** "just now", "35 min ago", "5 h ago", "2 days ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const REGION_LABELS: Record<string, string> = {
  europe: "Europe", emea: "EMEA", latam: "Latin America", "north-america": "North America", americas: "the Americas",
  apac: "Asia-Pacific", asia: "Asia", oceania: "Oceania", "middle-east": "the Middle East", africa: "Africa",
};

/** "Canada, United States +2 more", "anywhere": who a remote job is open to. */
export function scopeLabel(countries: readonly string[] | null | undefined): string | null {
  if (!countries?.length) return null;
  if (countries.includes(ANYWHERE)) return "anywhere";
  const names = countries.map((c) => REGION_LABELS[c] ?? countryName(c) ?? c);
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3} more` : names.join(", ");
}

/** "Toronto, ON, Canada", "Berlin, Germany · Remote", "Remote: open to Europe". Nothing missing is filled in. */
export function placeLabel(p: { city: string | null; province: string | null; remote: boolean; country?: string | null; countries?: readonly string[] | null }): string {
  const country = p.country ? countryName(p.country) : null;
  const place = [p.city, p.province, country].filter(Boolean).join(", ");
  if (p.remote) {
    if (p.city || p.province) return `${place} · Remote`;
    const open = scopeLabel(p.countries) ?? country;
    return open ? `Remote: open to ${open}` : "Remote";
  }
  return place || scopeLabel(p.countries) || "Location not stated";
}

/**
 * How a document was made. "AI Tailored" only ever means a model rewrote it and the
 * accuracy check accepted it; nothing reordered by rules is called tailoring.
 */
export const DOC_METHOD_LABELS = {
  ai: "AI Tailored",
  smart: "Reordered (earlier version, not rewritten)",
  template: "Template draft (not AI-written)",
} as const;

/** How Improvement Notes were made. */
export const NOTES_METHOD_LABELS = { rules: "Guided Optimization", ai: "AI Improvement Notes" } as const;

/**
 * When a job was posted, said only as precisely as the source allows: "posted 3 h ago" from
 * the source's own date, "created 2 days ago" when that date is a creation time (Lever),
 * "first seen 5 h ago" when the source gives none, and never a guessed posting date.
 */
export function postedLabel(j: { source?: string | null; user_id?: string | null; posted_at: string; date_source: string; date_note?: string | null }, now = Date.now()): string {
  if (j.source === "manual" || j.user_id) return "added by you";
  if (j.date_source === "source") return `${j.date_note === "created" ? "created" : "posted"} ${timeAgo(j.posted_at, now)}`;
  if (j.date_source === "first_seen") return `first seen ${timeAgo(j.posted_at, now)}`;
  return "posting date unknown";
}
