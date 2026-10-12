/**
 * Application stages, in pipeline order. Matches the application_stage enum in the
 * database. Moves are free in any direction (non-linear, backwards, reopening): the
 * timeline records each one, and the database enforces one open attempt per job.
 */
export const STAGES = ["saved", "applied", "screening", "interviewing", "offer", "accepted", "rejected", "withdrawn", "no_response"] as const;
export type Stage = (typeof STAGES)[number];

export const CLOSED_STAGES: readonly Stage[] = ["accepted", "rejected", "withdrawn", "no_response"];
export const OPEN_STAGES: readonly Stage[] = STAGES.filter((s) => !CLOSED_STAGES.includes(s));

export const isStage = (s: unknown): s is Stage => typeof s === "string" && (STAGES as readonly string[]).includes(s);
export const isClosed = (s: Stage) => CLOSED_STAGES.includes(s);

export const STAGE_LABEL: Record<Stage, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  no_response: "No response",
};

/** One line under each stage name, so its meaning is unambiguous. */
export const STAGE_HINT: Record<Stage, string> = {
  saved: "Interested, not applied yet",
  applied: "Application sent",
  screening: "Recruiter call or assessment",
  interviewing: "Interviews scheduled or done",
  offer: "Offer received",
  accepted: "You accepted",
  rejected: "The employer said no",
  withdrawn: "You stepped back",
  no_response: "No reply after a long wait",
};

/** Where a move goes, described for the timeline and toasts. */
export function describeMove(from: Stage | null, to: Stage): string {
  if (!from) return `Added as ${STAGE_LABEL[to]}`;
  if (isClosed(from) && !isClosed(to)) return `Reopened: ${STAGE_LABEL[from]} → ${STAGE_LABEL[to]}`;
  return `${STAGE_LABEL[from]} → ${STAGE_LABEL[to]}`;
}

export const PAY_PERIODS = ["hour", "day", "week", "month", "year"] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

/** "CAD 95,000 / year". Pay stays in the currency and period the user entered. */
export function formatPay(amount: number | null, currency: string | null, period: string | null): string | null {
  if (amount === null || !currency || !period) return null;
  return `${currency} ${amount.toLocaleString("en-CA", { maximumFractionDigits: 2 })} / ${period}`;
}
