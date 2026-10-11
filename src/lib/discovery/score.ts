import { CONFIDENCE_RANK, type Confidence, type CriteriaEvaluation, type CriterionKey, type Fact } from "./evidence";

/**
 * Transparent relevance scoring. Every point in the score comes from a named,
 * evidence-backed criterion, and the breakdown is shown to the user.
 */

export type Weights = { education: number; program: number; career: number; company: number; location: number; evidence: number };
export const DEFAULT_WEIGHTS: Weights = { education: 30, program: 25, career: 15, company: 10, location: 10, evidence: 10 };

export const CONFIDENCE_FACTOR: Record<Confidence, number> = { high: 1, medium: 0.6, low: 0.3 };

export type ScoreLine = { key: keyof Weights; label: string; points: number; max: number; detail: string };
export type Tier = "verified" | "possible" | "rejected";

export type ScoreResult = {
  relevance: number;
  confidence: number;
  breakdown: ScoreLine[];
  reasons: string[];
  tier: Tier;
  tierReason: string;
};

const CRITERION_WEIGHT: Record<Exclude<CriterionKey, "gradYear" | "standing">, keyof Weights> = {
  institution: "education",
  program: "program",
  role: "career",
  company: "company",
  location: "location",
};

const LABELS: Record<keyof Weights, string> = {
  education: "Education",
  program: "Program",
  career: "Career",
  company: "Company",
  location: "Location",
  evidence: "Evidence",
};

const confLabel = (c: Confidence | null) => (c ? `${c} confidence` : "not verified");

/** Evidence quality: more independent sources and stronger facts score higher. */
function evidenceFactor(facts: Fact[]): { factor: number; detail: string } {
  const sources = new Set(facts.map((f) => f.sourceUrl)).size;
  const high = facts.filter((f) => f.confidence === "high").length;
  const share = facts.length ? high / facts.length : 0;
  const factor = Math.min(1, 0.35 * Math.min(sources, 2) + 0.3 * share);
  return { factor, detail: `${sources} public source${sources === 1 ? "" : "s"}, ${high} of ${facts.length} facts high confidence` };
}

export type Feedback = { excluded: boolean; bonus: number; note?: string };

export function scorePerson(evaluation: CriteriaEvaluation, facts: Fact[], weights: Weights = DEFAULT_WEIGHTS, feedback: Feedback = { excluded: false, bonus: 0 }): ScoreResult {
  // Criteria the user didn't ask about don't count, and their weight goes to the ones they did.
  const requested = (Object.keys(CRITERION_WEIGHT) as (keyof typeof CRITERION_WEIGHT)[]).filter((k) => evaluation[k].requested);
  const used = requested.reduce((s, k) => s + weights[CRITERION_WEIGHT[k]], 0) + weights.evidence;
  const scale = used > 0 ? 100 / used : 1;

  const breakdown: ScoreLine[] = [];
  const reasons: string[] = [];
  for (const k of requested) {
    const w = CRITERION_WEIGHT[k];
    const st = evaluation[k];
    const max = Math.round(weights[w] * scale);
    const points = st.confidence ? Math.round(max * CONFIDENCE_FACTOR[st.confidence]) : 0;
    const detail = st.value
      ? `${st.value} (${confLabel(st.confidence)})${st.note ? `: ${st.note}` : ""}`
      : st.conflict
        ? (st.note ?? "Works somewhere not on your list")
        : (st.note ?? "No evidence found");
    breakdown.push({ key: w, label: LABELS[w], points, max, detail });
    if (st.value && st.confidence) reasons.push(`${st.confidence === "high" ? "✓" : "~"} ${st.value}`);
    else reasons.push(st.conflict && st.note ? `✗ ${st.note}` : `? ${st.note ?? `${LABELS[w]} not verified`}`);
  }
  const ev = evidenceFactor(facts);
  const evMax = Math.round(weights.evidence * scale);
  breakdown.push({ key: "evidence", label: LABELS.evidence, points: Math.round(evMax * ev.factor), max: evMax, detail: ev.detail });

  let relevance = Math.min(100, breakdown.reduce((s, l) => s + l.points, 0) + feedback.bonus);
  const keyConfidences = requested.map((k) => evaluation[k].confidence);
  const confidence = keyConfidences.length
    ? Math.round((keyConfidences.reduce((s, c) => s + (c ? CONFIDENCE_FACTOR[c] : 0), 0) / keyConfidences.length) * 100)
    : 0;

  const { tier, reason } = feedback.excluded ? { tier: "rejected" as const, reason: feedback.note ?? "Excluded by your feedback" } : decideTier(evaluation);
  if (tier === "rejected") relevance = Math.min(relevance, 40);
  return { relevance, confidence, breakdown, reasons, tier, tierReason: reason };
}

const atLeast = (c: Confidence | null, min: Confidence) => c !== null && CONFIDENCE_RANK[c] >= CONFIDENCE_RANK[min];

/**
 * Quality over count: "verified" needs the school and the program proven at high
 * confidence and every other requested criterion supported. Weaker evidence makes
 * a person "possible"; missing the school, or a known mismatch, rejects them.
 */
export function decideTier(e: CriteriaEvaluation): { tier: Tier; reason: string } {
  if (e.institution.requested && !atLeast(e.institution.confidence, "medium")) return { tier: "rejected", reason: "School not verified" };
  if (e.program.requested && !e.program.confidence) return { tier: "rejected", reason: "Program not verified" };
  if (e.company.conflict) return { tier: "rejected", reason: "Works at a company not on your list" };
  if (e.location.conflict) return { tier: "rejected", reason: e.location.note ?? "Located outside the requested country" };
  if (e.standing.conflict) return { tier: "possible", reason: e.standing.note ?? "Student status doesn't match" };

  const strong =
    (!e.institution.requested || e.institution.confidence === "high") &&
    (!e.program.requested || e.program.confidence === "high") &&
    (!e.role.requested || atLeast(e.role.confidence, "medium")) &&
    (!e.company.requested || atLeast(e.company.confidence, "medium")) &&
    (!e.location.requested || atLeast(e.location.confidence, "medium")) &&
    (!e.gradYear.requested || atLeast(e.gradYear.confidence, "medium"));
  if (strong) return { tier: "verified", reason: "Every requested criterion is backed by evidence" };

  const missing = (["institution", "program", "role", "company", "location", "gradYear"] as CriterionKey[])
    .filter((k) => e[k].requested && e[k].confidence !== "high")
    .map((k) => (k === "gradYear" ? "graduation year" : k === "location" && e.location.note ? `location (${e.location.note.toLowerCase()})` : k));
  return { tier: "possible", reason: `Weaker evidence for ${missing.join(", ")}` };
}

/** Final order: deterministic relevance first; the AI's networking value only breaks near-ties. */
export function rankScore(relevance: number, networkingValue: number | null): number {
  return networkingValue === null ? relevance : Math.round(relevance * 0.8 + networkingValue * 0.2);
}
