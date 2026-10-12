/**
 * Interview events as an iCalendar file (RFC 5545). Times are written in UTC ("Z"), which
 * every calendar reads correctly and places in its own time zone; the zone the user
 * scheduled in is noted in the description. Each event's UID is the interview's id, and
 * SEQUENCE grows when its time changes, so re-importing updates the event in place.
 */

export type IcsInterview = {
  id: string;
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  kind: string;
  location: string | null;
  notes: string | null;
  sequence: number;
  updatedAt: string;
};

export type IcsApplication = { title: string; company: string | null };

const UID_DOMAIN = "network-growth-assistant";

/** 20261020T210000Z */
export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapes text values: backslash, semicolon, comma and newlines. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 octets, continuing with CRLF + space, never splitting a character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + n > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const KIND_LABEL: Record<string, string> = { phone: "Phone interview", video: "Video interview", onsite: "On-site interview", technical: "Technical interview", other: "Interview" };

export function interviewsToIcs(app: IcsApplication, interviews: IcsInterview[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Network Growth Assistant//Applications//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const i of interviews) {
    const start = new Date(i.startsAt);
    const end = new Date(start.getTime() + i.durationMinutes * 60_000);
    const summary = `${KIND_LABEL[i.kind] ?? "Interview"}: ${app.title}${app.company ? ` at ${app.company}` : ""}`;
    const description = [`Scheduled in ${i.timezone}.`, i.notes?.trim()].filter(Boolean).join("\n\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${i.id}@${UID_DOMAIN}`,
      `DTSTAMP:${icsDate(now)}`,
      `LAST-MODIFIED:${icsDate(new Date(i.updatedAt))}`,
      `SEQUENCE:${i.sequence}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      ...(i.location?.trim() ? [`LOCATION:${escapeText(i.location.trim())}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
