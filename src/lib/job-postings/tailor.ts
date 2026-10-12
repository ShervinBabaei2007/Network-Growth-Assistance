import type { AIProvider, DocumentFormat, JobContext, TailorMode } from "@/lib/ai/provider";
import { clean } from "@/lib/text/match";
import type { CoverLetterDoc, GuardIssue, TailoredResumeDoc } from "./documents";
import { guardCoverLetter, guardResume, type AiCoverLetter, type AiTailoredResume } from "./tailor-guard";
import type { ResumeProfile } from "./types";

/**
 * AI tailoring. The model rewrites the resume (or CV, or cover letter) for one job; the
 * accuracy guard removes anything the resume doesn't support; then a materiality check
 * makes sure the result is really different from the original. A near-identical result
 * gets one retry with feedback. If it still isn't materially tailored, nothing is saved:
 * the caller offers Improvement Notes instead. A reordered copy of the original is never
 * presented as a tailored resume.
 */

export type { TailorMode } from "@/lib/ai/provider";

/** A bullet counts as rewritten when under this share of its words are unchanged. */
export const REWORDED_MAX_OVERLAP = 0.8;
/** Share of kept bullets that must be rewritten… */
export const MATERIAL_BULLET_SHARE = 0.4;
/** …or this share, together with a rewritten summary. */
export const MATERIAL_WITH_SUMMARY_SHARE = 0.25;

const words = (s: string) => clean(s).trim().split(" ").filter(Boolean);

/** Word-set overlap of two texts (Jaccard), 0–1. */
export function overlap(a: string, b: string): number {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size && !B.size) return 1;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

export type Materiality = {
  bullets: number;
  reworded: number;
  share: number;
  summaryChanged: boolean;
  /** Bullets that moved earlier within their entry. */
  movedUp: number;
  material: boolean;
};

/** How much a tailored document differs from the resume it was written from. */
export function materiality(profile: ResumeProfile, doc: TailoredResumeDoc): Materiality {
  const original = new Map<string, string>();
  const position = new Map<string, number>();
  for (const e of [...profile.experience, ...profile.projects]) e.bullets.forEach((b, i) => (original.set(b.id, b.text), position.set(b.id, i)));
  let bullets = 0;
  let reworded = 0;
  let movedUp = 0;
  for (const s of doc.sections) {
    if (s.key !== "experience" && s.key !== "projects") continue;
    for (const e of s.entries) {
      e.bullets.forEach((b, i) => {
        bullets++;
        const sources = b.sourceBulletIds.map((id) => original.get(id) ?? "").join(" ");
        if (overlap(b.text, sources) < REWORDED_MAX_OVERLAP) reworded++;
        const was = Math.min(...b.sourceBulletIds.map((id) => position.get(id) ?? i));
        if (i < was) movedUp++;
      });
    }
  }
  const share = bullets ? reworded / bullets : 0;
  const summaryChanged = Boolean(doc.summary) && overlap(doc.summary ?? "", profile.summary ?? "") < REWORDED_MAX_OVERLAP;
  const material = bullets > 0 && (share >= MATERIAL_BULLET_SHARE || (summaryChanged && share >= MATERIAL_WITH_SUMMARY_SHARE));
  return { bullets, reworded, share, summaryChanged, movedUp, material };
}

export type TailorOutcome =
  | { ok: true; doc: TailoredResumeDoc; issues: GuardIssue[]; materiality: Materiality; attempts: number }
  /** not_material: the model couldn't produce a meaningful rewrite without inventing details. */
  | { ok: false; reason: "not_material"; materiality: Materiality; attempts: number }
  | { ok: false; reason: "ai_failed"; error: string; attempts: number };

const feedbackFor = (m: Materiality, issues: GuardIssue[]) =>
  [
    m.material
      ? null
      : `Only ${m.reworded} of ${m.bullets} bullets were actually reworded${m.summaryChanged ? "" : ", and the summary wasn't rewritten"}. The result is too close to the original. Rewrite each relevant bullet in the posting's language (keeping its facts) and write a summary aimed at this role.`,
    issues.length ? `These lines were rejected by the accuracy check:\n${issues.slice(0, 15).map((i) => `- "${i.text.slice(0, 160)}": ${i.reason}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

/**
 * Tailors a resume or CV. Up to two model calls: the second only when the first wasn't
 * materially different or had lines rejected by the guard.
 */
export async function tailorDocument(ai: AIProvider, input: JobContext & { resumeText: string; format: DocumentFormat }): Promise<TailorOutcome> {
  let last: { doc: TailoredResumeDoc; issues: GuardIssue[]; materiality: Materiality } | null = null;
  let attempts = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    attempts++;
    const feedback = last ? feedbackFor(last.materiality, last.issues) : undefined;
    const res = input.format === "cv" ? await ai.tailorCV(input, feedback) : await ai.tailorResume(input, feedback);
    if (!res.ok) {
      if (last) break;
      return { ok: false, reason: "ai_failed", error: res.reason, attempts };
    }
    const guarded = guardResume(res.data as AiTailoredResume, input.profile, input.resumeText, { format: input.format });
    const m = materiality(input.profile, guarded.doc);
    const candidate = { ...guarded, materiality: m };
    // Prefer a material result, then the one with fewer rejected lines.
    if (!last || (m.material && !last.materiality.material) || (m.material === last.materiality.material && guarded.issues.length <= last.issues.length)) last = candidate;
    if (m.material && !guarded.issues.length) break;
  }
  if (!last) return { ok: false, reason: "ai_failed", error: "The AI service didn't answer.", attempts };
  if (!last.materiality.material) return { ok: false, reason: "not_material", materiality: last.materiality, attempts };
  return { ok: true, doc: last.doc, issues: last.issues, materiality: last.materiality, attempts };
}

export type LetterOutcome = { ok: true; doc: CoverLetterDoc; issues: GuardIssue[] } | { ok: false; error: string };

/** A cover letter written by the model, every sentence checked against the resume and posting. */
export async function writeCoverLetter(ai: AIProvider, input: JobContext & { resumeText: string }): Promise<LetterOutcome> {
  const posting = { text: input.posting.description, company: input.posting.company, title: input.posting.title };
  let last: { doc: CoverLetterDoc; issues: GuardIssue[] } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const feedback = last?.issues.length ? feedbackFor({ material: true } as Materiality, last.issues) : undefined;
    const res = await ai.generateCoverLetter(input, feedback);
    if (!res.ok) {
      if (last) break;
      return { ok: false, error: res.reason };
    }
    const guarded = guardCoverLetter(res.data as AiCoverLetter, input.profile, input.resumeText, posting);
    if (!last || guarded.issues.length <= last.issues.length) last = guarded;
    if (!guarded.issues.length) break;
  }
  return last ? { ok: true, ...last } : { ok: false, error: "The AI service didn't answer." };
}

export const isMode = (m: unknown): m is TailorMode => m === "normal" || m === "apply_anyway";
