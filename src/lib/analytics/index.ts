import { addDays, localDate, weekStart } from "@/lib/dates";
import { acceptanceRate, MIN_RESOLVED_FOR_RATE } from "@/lib/prioritize";

export type AnalyticsInput = {
  now: Date;
  timezone: string;
  days: number;
  weeks: number;
  invitations: { sentAt: string; outcome: "pending" | "accepted" | "declined" | "withdrawn"; resolvedAt: string | null }[];
  /** Connections confirmed by the LinkedIn export with no logged invitation. */
  exportConnections: { connectedAt: string }[];
  snapshots: { recordedAt: string; total: number }[];
};

export type DayPoint = { date: string; sent: number; accepted: number };
export type WeekRow = { weekOf: string; sent: number; accepted: number; declinedOrWithdrawn: number };

/** Turns recorded events into chart series. Every number comes from a stored record. */
export function buildAnalytics(input: AnalyticsInput) {
  const tz = input.timezone;
  const today = localDate(input.now, tz);
  const firstDay = addDays(today, -(input.days - 1));
  const firstWeek = addDays(weekStart(today), -7 * (input.weeks - 1));

  const daily = new Map<string, DayPoint>();
  for (let i = 0; i < input.days; i++) {
    const d = addDays(firstDay, i);
    daily.set(d, { date: d, sent: 0, accepted: 0 });
  }
  const weekly = new Map<string, WeekRow>();
  for (let i = 0; i < input.weeks; i++) {
    const w = addDays(firstWeek, 7 * i);
    weekly.set(w, { weekOf: w, sent: 0, accepted: 0, declinedOrWithdrawn: 0 });
  }

  const outcomes = { accepted: 0, declined: 0, withdrawn: 0 };
  let pending = 0;

  for (const inv of input.invitations) {
    const sentOn = localDate(inv.sentAt, tz);
    const dp = daily.get(sentOn);
    if (dp) dp.sent++;
    const wr = weekly.get(weekStart(sentOn));
    if (wr) wr.sent++;

    if (inv.outcome === "pending") {
      pending++;
      continue;
    }
    outcomes[inv.outcome]++;
    if (!inv.resolvedAt) continue;
    const resolvedOn = localDate(inv.resolvedAt, tz);
    const rw = weekly.get(weekStart(resolvedOn));
    if (inv.outcome === "accepted") {
      const rd = daily.get(resolvedOn);
      if (rd) rd.accepted++;
      if (rw) rw.accepted++;
    } else if (rw) {
      rw.declinedOrWithdrawn++;
    }
  }
  for (const c of input.exportConnections) {
    const on = localDate(c.connectedAt, tz);
    const dp = daily.get(on);
    if (dp) dp.accepted++;
    const wr = weekly.get(weekStart(on));
    if (wr) wr.accepted++;
  }

  const rate = acceptanceRate(outcomes);
  const resolved = outcomes.accepted + outcomes.declined + outcomes.withdrawn;
  const dailySeries = [...daily.values()];
  const weeklyRows = [...weekly.values()];

  // One point per day: the last count recorded that day.
  const byDay = new Map<string, { date: string; total: number }>();
  for (const s of [...input.snapshots].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
    const d = localDate(s.recordedAt, tz);
    byDay.set(d, { date: d, total: s.total });
  }

  return {
    today,
    daily: dailySeries,
    weekly: weeklyRows,
    hasActivity: dailySeries.some((d) => d.sent > 0 || d.accepted > 0),
    networkHistory: [...byDay.values()],
    acceptance: {
      accepted: outcomes.accepted,
      declined: outcomes.declined,
      withdrawn: outcomes.withdrawn,
      resolved,
      pending,
      /** null until enough invitations have an outcome to say anything useful. */
      rate: rate.measured ? outcomes.accepted / resolved : null,
      minResolved: MIN_RESOLVED_FOR_RATE,
    },
  };
}
