import { disciplineName, poolUniversities, targetUniversities, universityName, type Catalog, type Discipline, type University } from "@/lib/domain";
import type { DisciplineProgress } from "@/lib/progress";

/** Resolved invitations needed before the measured acceptance rate replaces the default. */
export const MIN_RESOLVED_FOR_RATE = 20;
export const DEFAULT_ACCEPTANCE_RATE = 0.5;

export type EligibleCandidate = {
  id: string;
  discipline: Discipline;
  university: University;
  discoveredAt: string;
};

export type QueueItem = {
  candidateId: string;
  rank: number;
  discipline: Discipline;
  university: University;
  isAlternate: boolean;
  reason: string;
};

export type Shortfall = {
  discipline: Discipline;
  /** null when the shortfall is for the whole discipline (after alternates). */
  university: University | null;
  invitesWanted: number;
  available: number;
  suggestion: string;
};

export type QueuePlan = {
  blocked: "paused" | "no-daily-target" | "capacity-reached" | "all-targets-met" | null;
  slots: number;
  acceptanceRate: number;
  rateIsMeasured: boolean;
  items: QueueItem[];
  shortfalls: Shortfall[];
};

export type PlanInput = {
  disciplines: DisciplineProgress[];
  /** The user's own schools and disciplines, for names and which schools have targets. */
  catalog: Catalog;
  eligible: EligibleCandidate[];
  /** Candidate ids skipped earlier today; they are not offered again today. */
  skippedToday: string[];
  outcomes: { accepted: number; declined: number; withdrawn: number };
  settings: { paused: boolean; dailyInviteTarget: number | null; weeklyInviteCap: number | null };
  sentToday: number;
  sentThisWeek: number;
};

export function acceptanceRate(outcomes: PlanInput["outcomes"]) {
  const resolved = outcomes.accepted + outcomes.declined + outcomes.withdrawn;
  if (resolved < MIN_RESOLVED_FOR_RATE) return { rate: DEFAULT_ACCEPTANCE_RATE, measured: false, resolved };
  // Clamp so one bad week can't make the plan absurd.
  return { rate: Math.min(1, Math.max(0.1, outcomes.accepted / resolved)), measured: true, resolved };
}

/** What to search LinkedIn for to find more people in a category: the user's own names for it. */
const searchHint = (catalog: Catalog, d: Discipline, u: University) => `“${disciplineName(catalog, d)}” at ${universityName(catalog, u)}`;

/**
 * Plans today's invitations. Disciplines are served in priority order; within a
 * discipline, the cells of schools with their own targets that still need the most come
 * first. Candidates from the user's other schools (extra pools) fill in only when those
 * run short, and are marked as alternates. Pending invitations are discounted by the expected acceptance rate
 * so a category with many outstanding invites is not over-contacted. A category is
 * never padded with unqualified people: shortfalls are reported instead.
 */
export function planQueue(input: PlanInput): QueuePlan {
  const { rate, measured } = acceptanceRate(input.outcomes);
  const { settings, catalog } = input;
  const primaryIds = targetUniversities(catalog).map((u) => u.id);
  const poolIds = poolUniversities(catalog).map((u) => u.id);
  const short = (u: University) => universityName(catalog, u);
  const base = { acceptanceRate: rate, rateIsMeasured: measured, items: [] as QueueItem[] };

  const invitesFor = (target: number, accepted: number, pending: number) =>
    Math.max(0, Math.ceil((target - accepted - pending * rate) / rate));

  // Shortfalls are useful even when nothing can be queued today.
  const skipped = new Set(input.skippedToday);
  const pools = new Map<string, EligibleCandidate[]>();
  for (const c of [...input.eligible].sort((a, b) => a.discoveredAt.localeCompare(b.discoveredAt))) {
    if (skipped.has(c.id)) continue;
    const k = `${c.discipline}:${c.university}`;
    pools.set(k, [...(pools.get(k) ?? []), c]);
  }
  const pool = (d: Discipline, u: University) => pools.get(`${d}:${u}`) ?? [];

  const shortfalls: Shortfall[] = [];
  const active = input.disciplines.filter((d) => !d.complete);
  for (const d of active) {
    let primaryShort = 0;
    for (const cell of d.primaryCells) {
      if (cell.target === null) continue;
      const wanted = invitesFor(cell.target, cell.accepted, cell.pending);
      const available = pool(d.discipline, cell.university).length;
      if (available < wanted) {
        primaryShort += wanted - available;
        shortfalls.push({
          discipline: d.discipline,
          university: cell.university,
          invitesWanted: wanted,
          available,
          suggestion: `Search LinkedIn for ${searchHint(catalog, d.discipline, cell.university)}.`,
        });
      }
    }
    // The gap the primary pools leave, capped by what the discipline as a whole still needs.
    const disciplineWanted = invitesFor(d.target, d.accepted, d.pending);
    const primaryAvailable = primaryIds.reduce((n, u) => n + pool(d.discipline, u).length, 0);
    const alternates = poolIds.reduce((n, u) => n + pool(d.discipline, u).length, 0);
    const gap = Math.min(primaryShort, Math.max(0, disciplineWanted - primaryAvailable));
    if (gap > alternates) {
      shortfalls.push({
        discipline: d.discipline,
        university: null,
        invitesWanted: disciplineWanted,
        available: primaryAvailable + alternates,
        suggestion: poolIds.length
          ? `Even with ${poolIds.map(short).join(", ")}, ${disciplineName(catalog, d.discipline)} needs more candidates. Search LinkedIn for ${poolIds.map((u) => searchHint(catalog, d.discipline, u)).join(" or ")}, or add more schools in Settings.`
          : `${disciplineName(catalog, d.discipline)} needs more candidates. Add more schools in Settings (schools without their own targets add to this discipline's pool).`,
      });
    }
  }

  if (settings.paused) return { ...base, blocked: "paused", slots: 0, shortfalls };
  if (settings.dailyInviteTarget === null) return { ...base, blocked: "no-daily-target", slots: 0, shortfalls };
  if (active.length === 0) return { ...base, blocked: "all-targets-met", slots: 0, shortfalls };

  let slots = Math.max(0, settings.dailyInviteTarget - input.sentToday);
  if (settings.weeklyInviteCap !== null) {
    slots = Math.min(slots, Math.max(0, settings.weeklyInviteCap - input.sentThisWeek));
  }
  if (slots === 0) return { ...base, blocked: "capacity-reached", slots: 0, shortfalls };

  const items: QueueItem[] = [];
  const add = (c: EligibleCandidate, isAlternate: boolean, reason: string) =>
    items.push({ candidateId: c.id, rank: items.length + 1, discipline: c.discipline, university: c.university, isAlternate, reason });

  for (const d of active) {
    if (items.length >= slots) break;
    const name = disciplineName(catalog, d.discipline);
    let disciplineLeft = invitesFor(d.target, d.accepted, d.pending);
    if (disciplineLeft === 0) continue; // enough invitations are already pending

    // Primary cells: always take from the cell with the most still wanted.
    const cells = d.primaryCells
      .filter((c) => c.target !== null)
      .map((c) => ({ u: c.university, left: invitesFor(c.target!, c.accepted, c.pending), queue: [...pool(d.discipline, c.university)] }));
    for (;;) {
      if (items.length >= slots || disciplineLeft === 0) break;
      const next = cells.filter((c) => c.left > 0 && c.queue.length > 0).sort((a, b) => b.left - a.left)[0];
      if (!next) break;
      const remaining = d.primaryCells.find((c) => c.university === next.u)!.remaining;
      add(next.queue.shift()!, false, `${name} (priority ${d.rank}) · ${short(next.u)} still needs ${remaining}`);
      next.left--;
      disciplineLeft--;
    }

    // Alternates only for what the primary pools could not cover.
    const uncovered = cells.reduce((n, c) => n + (c.queue.length === 0 ? c.left : 0), 0);
    let alternateLeft = Math.min(uncovered, disciplineLeft);
    const altQueues = poolIds.map((u) => ({ u, queue: [...pool(d.discipline, u)] }));
    while (alternateLeft > 0 && items.length < slots) {
      const next = altQueues.filter((q) => q.queue.length > 0).sort((a, b) => b.queue.length - a.queue.length)[0];
      if (!next) break;
      const empty = cells.filter((c) => c.queue.length === 0 && c.left > 0).map((c) => short(c.u));
      const pools = empty.length > 1 ? `${empty.join(" and ")} pools are` : `${empty[0]} pool is`;
      add(next.queue.shift()!, true, `${name} (priority ${d.rank}) · alternate from ${short(next.u)} because the ${pools} short`);
      alternateLeft--;
      disciplineLeft--;
    }
  }

  return { ...base, blocked: null, slots, items, shortfalls };
}
