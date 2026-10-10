import { localDate, weekStart } from "@/lib/dates";
import { PRIMARY_UNIVERSITIES, type Discipline, type University } from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";

type CandidateStatus = Database["public"]["Enums"]["candidate_status"];
type InvitationOutcome = Database["public"]["Enums"]["invitation_outcome"];

export const ADDITIONAL_UNIVERSITIES: readonly University[] = ["sfu", "waterloo"];

/** Statuses that make a candidate unavailable for any outreach or count. */
const EXCLUDED_STATUSES: readonly CandidateStatus[] = ["not_a_match", "do_not_contact"];

export type ProgressInput = {
  now: Date;
  settings: {
    overallTarget: number;
    baselineConnections: number | null;
    projectStartDate: string;
    timezone: string;
    disciplinePriority: Discipline[];
  };
  targets: { discipline: Discipline; university: University | null; targetCount: number }[];
  latestSnapshot: { totalConnections: number; recordedAt: string } | null;
  invitations: {
    outcome: InvitationOutcome;
    sentAt: string;
    resolvedAt: string | null;
    discipline: Discipline | null;
    university: University | null;
    /** Both university and discipline are confirmed. */
    classified: boolean;
    preexisting: boolean;
  }[];
  /**
   * Connections confirmed by LinkedIn's export with no invitation logged. They count
   * like acceptances but are not part of invitation activity or the acceptance rate.
   */
  exportConnections?: {
    connectedAt: string;
    discipline: Discipline | null;
    university: University | null;
    classified: boolean;
    preexisting: boolean;
  }[];
  candidateCounts: {
    discipline: Discipline | null;
    university: University | null;
    status: CandidateStatus;
    classified: boolean;
    count: number;
  }[];
  discovered: { today: number; thisWeek: number };
};

type Tally = { accepted: number; pending: number; available: number; identified: number };

export type CellProgress = Tally & {
  discipline: Discipline;
  university: University;
  target: number | null;
  remaining: number | null;
  percent: number | null;
};

export type DisciplineProgress = {
  discipline: Discipline;
  rank: number;
  target: number;
  accepted: number;
  acceptedPrimary: number;
  acceptedAdditional: number;
  pending: number;
  available: number;
  remaining: number;
  percent: number;
  complete: boolean;
  /** The highest-priority discipline that still has an unmet target. */
  isFocus: boolean;
  primaryCells: CellProgress[];
  additionalCells: CellProgress[];
};

export type Progress = ReturnType<typeof computeProgress>;

const percentOf = (value: number, target: number) =>
  target <= 0 ? 100 : Math.min(100, Math.round((value / target) * 1000) / 10);

/**
 * Turns raw records into dashboard figures. Only accepted invitations that were
 * resolved on or after the project start, for candidates whose university and
 * discipline are both confirmed and who were not already connections, count
 * toward targets. Pending invitations are reported separately and never counted.
 */
export function computeProgress(input: ProgressInput) {
  const { settings } = input;
  const tz = settings.timezone;
  const today = localDate(input.now, tz);
  const thisWeek = weekStart(today);

  const key = (d: Discipline, u: University) => `${d}:${u}`;
  const tallies = new Map<string, Tally>();
  const tally = (d: Discipline, u: University) => {
    const k = key(d, u);
    let t = tallies.get(k);
    if (!t) tallies.set(k, (t = { accepted: 0, pending: 0, available: 0, identified: 0 }));
    return t;
  };

  let trackedAccepted = 0;
  let acceptedNeedsClassification = 0;
  let pending = 0;
  let pendingUnclassified = 0;
  const activity = { sentToday: 0, sentThisWeek: 0, acceptedToday: 0, acceptedThisWeek: 0 };
  // Every resolved invitation, classified or not, for the acceptance rate.
  const outcomes = { accepted: 0, declined: 0, withdrawn: 0 };

  for (const inv of input.invitations) {
    const sentOn = localDate(inv.sentAt, tz);
    if (sentOn === today) activity.sentToday++;
    if (sentOn >= thisWeek) activity.sentThisWeek++;

    const categorized = inv.classified && inv.discipline && inv.university;

    if (inv.outcome === "pending") {
      pending++;
      if (categorized) tally(inv.discipline!, inv.university!).pending++;
      else pendingUnclassified++;
      continue;
    }

    outcomes[inv.outcome]++;
    if (inv.outcome !== "accepted" || !inv.resolvedAt) continue;
    const acceptedOn = localDate(inv.resolvedAt, tz);
    if (acceptedOn === today) activity.acceptedToday++;
    if (acceptedOn >= thisWeek) activity.acceptedThisWeek++;

    if (inv.preexisting || acceptedOn < settings.projectStartDate) continue;
    if (categorized) {
      trackedAccepted++;
      tally(inv.discipline!, inv.university!).accepted++;
    } else {
      acceptedNeedsClassification++;
    }
  }

  let fromExport = 0;
  for (const c of input.exportConnections ?? []) {
    if (c.preexisting || localDate(c.connectedAt, tz) < settings.projectStartDate) continue;
    if (c.classified && c.discipline && c.university) {
      trackedAccepted++;
      fromExport++;
      tally(c.discipline, c.university).accepted++;
    } else {
      acceptedNeedsClassification++;
    }
  }

  let awaitingReview = 0;
  let readyForOutreach = 0;
  for (const row of input.candidateCounts) {
    if (row.status === "new" || row.status === "awaiting_review") awaitingReview += row.count;
    if (!row.classified || !row.discipline || !row.university) continue;
    if (EXCLUDED_STATUSES.includes(row.status)) continue;
    const t = tally(row.discipline, row.university);
    t.identified += row.count;
    if (row.status === "approved") {
      t.available += row.count;
      readyForOutreach += row.count;
    }
  }

  const targetFor = (d: Discipline, u: University | null) =>
    input.targets.find((t) => t.discipline === d && t.university === u)?.targetCount ?? null;

  const cell = (d: Discipline, u: University): CellProgress => {
    const t = tallies.get(key(d, u)) ?? { accepted: 0, pending: 0, available: 0, identified: 0 };
    const target = targetFor(d, u);
    return {
      discipline: d,
      university: u,
      ...t,
      target,
      remaining: target === null ? null : Math.max(0, target - t.accepted),
      percent: target === null ? null : percentOf(t.accepted, target),
    };
  };

  let focusAssigned = false;
  const disciplines: DisciplineProgress[] = settings.disciplinePriority.map((d, i) => {
    const primaryCells = PRIMARY_UNIVERSITIES.map((u) => cell(d, u));
    const additionalCells = ADDITIONAL_UNIVERSITIES.map((u) => cell(d, u));
    const all = [...primaryCells, ...additionalCells];
    const sum = (f: (c: CellProgress) => number, cells = all) =>
      cells.reduce((n, c) => n + f(c), 0);

    const target = targetFor(d, null) ?? 0;
    const accepted = sum((c) => c.accepted);
    const complete = accepted >= target;
    const isFocus = !complete && !focusAssigned;
    if (isFocus) focusAssigned = true;

    return {
      discipline: d,
      rank: i + 1,
      target,
      accepted,
      acceptedPrimary: sum((c) => c.accepted, primaryCells),
      acceptedAdditional: sum((c) => c.accepted, additionalCells),
      pending: sum((c) => c.pending),
      available: sum((c) => c.available),
      remaining: Math.max(0, target - accepted),
      percent: percentOf(accepted, target),
      complete,
      isFocus,
      primaryCells,
      additionalCells,
    };
  });

  const { baselineConnections: baseline, overallTarget } = settings;
  const current = input.latestSnapshot?.totalConnections ?? null;
  const growthGoal = baseline === null ? null : Math.max(0, overallTarget - baseline);
  const additionalSinceStart = baseline === null || current === null ? null : current - baseline;

  return {
    today,
    weekStart: thisWeek,
    overall: {
      target: overallTarget,
      baseline,
      current,
      snapshotAt: input.latestSnapshot?.recordedAt ?? null,
      growthGoal,
      additionalSinceStart,
      remaining: current === null ? null : Math.max(0, overallTarget - current),
      percent:
        growthGoal === null || additionalSinceStart === null
          ? null
          : percentOf(Math.max(0, additionalSinceStart), growthGoal),
      trackedAccepted,
      /** Part of trackedAccepted that came from the LinkedIn export rather than an invitation. */
      fromExport,
      acceptedNeedsClassification,
      pending,
      pendingUnclassified,
      awaitingReview,
      readyForOutreach,
    },
    outcomes,
    activity: { ...activity, discoveredToday: input.discovered.today, discoveredThisWeek: input.discovered.thisWeek },
    disciplines,
    focus: disciplines.find((d) => d.isFocus) ?? null,
  };
}
