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
  citizen: "Canadian citizen",
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

export function placeLabel(p: { city: string | null; province: string | null; remote: boolean }): string {
  const place = [p.city, p.province].filter(Boolean).join(", ");
  return p.remote ? (place ? `${place} · Remote` : "Remote in Canada") : place || "Canada";
}
