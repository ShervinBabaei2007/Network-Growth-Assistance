/**
 * Dates for the tracker, formatted on the server in the user's own time zone (from
 * Settings), so server and browser render the same text.
 */

import type { Locale } from "@/lib/i18n/core";

const cache = new Map<string, Intl.DateTimeFormat>();
/** Canadian English unless the person's language is French. */
const tagOf = (locale?: Locale) => (locale === "fr-CA" ? "fr-CA" : "en-CA");
function fmt(timeZone: string, opts: Intl.DateTimeFormatOptions, locale?: Locale): Intl.DateTimeFormat {
  const key = `${tagOf(locale)}|${timeZone}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(tagOf(locale), { timeZone, ...opts });
    cache.set(key, f);
  }
  return f;
}

/** "Oct 20, 2026" */
export const formatDay = (iso: string, timeZone: string, locale?: Locale) => fmt(timeZone, { month: "short", day: "numeric", year: "numeric" }, locale).format(new Date(iso));

/** "Oct 20, 2026, 2:30 p.m." */
export const formatDateTime = (iso: string, timeZone: string, locale?: Locale) =>
  fmt(timeZone, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }, locale).format(new Date(iso));

/** A date-only value ("2026-10-20") is a calendar day, not an instant: never shift it by zone. */
export const formatDateOnly = (date: string, locale?: Locale) => fmt("UTC", { month: "short", day: "numeric", year: "numeric" }, locale).format(new Date(`${date}T00:00:00Z`));

/** "today", "in 3 days", "2 days ago", relative to `now` in the user's zone. */
export function relativeDays(iso: string, timeZone: string, now: Date, locale?: Locale): string {
  const day = (d: Date) => fmt(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const diff = Math.round((Date.parse(`${day(new Date(iso))}T00:00:00Z`) - Date.parse(`${day(now)}T00:00:00Z`)) / 86_400_000);
  if (locale === "fr-CA") {
    if (diff === 0) return "aujourd'hui";
    if (diff === 1) return "demain";
    if (diff === -1) return "hier";
    return diff > 0 ? `dans ${diff} jours` : `il y a ${-diff} jours`;
  }
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
