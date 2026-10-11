/**
 * Explicit limits for the research agent. A search always ends: when it has
 * enough verified people, when a budget runs out, or when new queries stop
 * turning up new people.
 */
export type Budget = {
  maxSearchQueries: number;
  maxPagesProcessed: number;
  maxCandidatesConsidered: number;
  maxLlmCalls: number;
  queriesPerStep: number;
  pagesPerStep: number;
  /** Stop after this many query batches in a row that found nobody new. */
  maxEmptyBatches: number;
  /** People reranked by the model at the end, best first. */
  maxReranked: number;
  /** Top people whose own pages (GitHub README, website) are read to verify them. */
  maxVerified: number;
  verifyPerStep: number;
};

export const DEFAULT_BUDGET: Budget = {
  maxSearchQueries: 30,
  maxPagesProcessed: 100,
  maxCandidatesConsidered: 200,
  maxLlmCalls: 60,
  queriesPerStep: 3,
  pagesPerStep: 8,
  maxEmptyBatches: 2,
  maxReranked: 45,
  maxVerified: 30,
  verifyPerStep: 6,
};

export type Progress = {
  queriesRun: number;
  pagesProcessed: number;
  candidatesConsidered: number;
  llmCalls: number;
  verified: number;
  emptyBatches: number;
  queriesRemaining: number;
};

export type StopReason = "target_reached" | "query_budget" | "page_budget" | "candidate_budget" | "llm_budget" | "no_new_people" | "plan_exhausted";

export const STOP_LABELS: Record<StopReason, string> = {
  target_reached: "Reached the number of verified people you asked for",
  query_budget: "Used the search budget",
  page_budget: "Used the page budget",
  candidate_budget: "Considered the maximum number of people",
  llm_budget: "Used the AI budget",
  no_new_people: "New searches stopped finding new people",
  plan_exhausted: "Ran every planned search",
};

export function stopReason(p: Progress, budget: Budget, target: number): StopReason | null {
  if (p.verified >= target) return "target_reached";
  if (p.queriesRun >= budget.maxSearchQueries) return "query_budget";
  if (p.pagesProcessed >= budget.maxPagesProcessed) return "page_budget";
  if (p.candidatesConsidered >= budget.maxCandidatesConsidered) return "candidate_budget";
  if (p.llmCalls >= budget.maxLlmCalls) return "llm_budget";
  if (p.emptyBatches >= budget.maxEmptyBatches) return "no_new_people";
  if (p.queriesRemaining <= 0) return "plan_exhausted";
  return null;
}

/** How many pages this step may process, never exceeding what's left of the budget. */
export const pagesThisStep = (p: Progress, budget: Budget) => Math.max(0, Math.min(budget.pagesPerStep, budget.maxPagesProcessed - p.pagesProcessed));
