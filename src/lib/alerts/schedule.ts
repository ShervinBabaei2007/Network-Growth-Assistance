import { addDays, localDate, localDateTimeToInstant } from "@/lib/dates";

export type AlertFrequency = "off" | "daily" | "weekly";

/**
 * When a saved search's alert runs next: at `hour` o'clock in the user's own time zone,
 * every day or on `weekday` (0 = Sunday), strictly after `after`. Clock changes are handled
 * by the zone rules: 8 a.m. stays 8 a.m. local, and an hour skipped by the spring change
 * runs at the first moment after it. Null when alerts are off.
 */
export function nextRunAt(frequency: AlertFrequency, weekday: number, hour: number, timeZone: string, after: Date): Date | null {
  if (frequency === "off") return null;
  const hh = String(hour).padStart(2, "0");
  let day = localDate(after, timeZone);
  for (let i = 0; i < 9; i++) {
    const at = localDateTimeToInstant(`${day}T${hh}:00`, timeZone);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (at.getTime() > after.getTime() && (frequency === "daily" || dow === weekday)) return at;
    day = addDays(day, 1);
  }
  return null;
}

/** A stable name for one scheduled run, so a retried run reuses its notification. */
export const runKey = (scheduledFor: string | null, now: Date) => (scheduledFor ? new Date(scheduledFor).toISOString() : now.toISOString()).slice(0, 16);
