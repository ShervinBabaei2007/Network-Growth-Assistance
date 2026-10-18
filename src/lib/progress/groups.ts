import { localDate, localDateTimeToInstant } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Invitations and export connections arrive from the database grouped by the user's local day, outcome and category
 * (see activity_invitation_groups). Progress and Analytics only use the local day of each time, so each group is
 * expanded into one entry per row, stamped at noon on its local day. That keeps a day's counts exact and lets the
 * existing calculations run unchanged, without reading every row.
 */

type Outcome = Database["public"]["Enums"]["invitation_outcome"];

export type InvitationGroup = {
  sent_on: string;
  resolved_on: string | null;
  outcome: Outcome;
  discipline: string | null;
  university: string | null;
  classified: boolean;
  preexisting: boolean;
  n: number;
};

export type ExportGroup = { connected_on: string; discipline: string | null; university: string | null; classified: boolean; preexisting: boolean; n: number };

const noon = (date: string, tz: string) => localDateTimeToInstant(`${date}T12:00`, tz).toISOString();

export function expandInvitationGroups(groups: InvitationGroup[], tz: string) {
  const stamp = memo((d: string) => noon(d, tz));
  return groups.flatMap((g) => {
    const row = {
      outcome: g.outcome,
      sentAt: stamp(g.sent_on),
      resolvedAt: g.resolved_on ? stamp(g.resolved_on) : null,
      discipline: g.discipline,
      university: g.university,
      classified: g.classified,
      preexisting: g.preexisting,
    };
    return Array.from({ length: g.n }, () => row);
  });
}

export function expandExportGroups(groups: ExportGroup[], tz: string) {
  const stamp = memo((d: string) => noon(d, tz));
  return groups.flatMap((g) => {
    const row = { connectedAt: stamp(g.connected_on), discipline: g.discipline, university: g.university, classified: g.classified, preexisting: g.preexisting };
    return Array.from({ length: g.n }, () => row);
  });
}

function memo(fn: (key: string) => string) {
  const seen = new Map<string, string>();
  return (key: string) => seen.get(key) ?? (seen.set(key, fn(key)), seen.get(key)!);
}

/** The local day of a stamp made above (a check for tests and callers). */
export const stampDay = (stamp: string, tz: string) => localDate(stamp, tz);
