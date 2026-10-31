import { addDays, localDate, localDateTimeToInstant } from "@/lib/dates";

/**
 * A reminder moved later by whole calendar days in the person's own time zone, keeping its wall-clock time. A reminder
 * set for 9:00 stays at 9:00 across a daylight-saving change instead of drifting to 8:00 or 10:00.
 */
export function shiftReminder(instant: string | Date, days: number, timeZone: string): Date {
  const at = typeof instant === "string" ? new Date(instant) : instant;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const date = addDays(localDate(at, timeZone), days);
  return localDateTimeToInstant(`${date}T${parts.hour}:${parts.minute}`, timeZone);
}
