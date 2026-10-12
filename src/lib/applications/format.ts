/**
 * Dates for the tracker, formatted on the server in the user's own time zone (from
 * Settings), so server and browser render the same text.
 */

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, ...opts });
    cache.set(key, f);
  }
  return f;
}

/** "Oct 20, 2026" */
export const formatDay = (iso: string, timeZone: string) => fmt(timeZone, { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));

/** "Oct 20, 2026, 2:30 p.m." */
export const formatDateTime = (iso: string, timeZone: string) =>
  fmt(timeZone, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** A date-only value ("2026-10-20") is a calendar day, not an instant: never shift it by zone. */
export const formatDateOnly = (date: string) => fmt("UTC", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T00:00:00Z`));

/** "today", "in 3 days", "2 days ago", relative to `now` in the user's zone. */
export function relativeDays(iso: string, timeZone: string, now: Date): string {
  const day = (d: Date) => fmt(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const diff = Math.round((Date.parse(`${day(new Date(iso))}T00:00:00Z`) - Date.parse(`${day(now)}T00:00:00Z`)) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

/** "2026-10-20T14:30" in the zone, for a datetime-local input's value. */
export function toLocalInput(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    fmt(timeZone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
