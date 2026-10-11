import { z } from "zod";
import type { LLMProvider } from "@/lib/discovery/llm";
import { SECTION_KEYS, type CoverLetterDoc, type GuardIssue, type TailoredResumeDoc } from "./documents";
import { guardCoverLetter, guardResume, type AiCoverLetter, type AiTailoredResume } from "./tailor-guard";
import type { Requirement, RequirementResult, ResumeProfile } from "./types";

/**
 * Writes a tailored resume and cover letter with the strong model, then runs the
 * server's accuracy check (tailor-guard). If the check rejects lines, the model gets
 * one retry with the reasons; anything still failing is replaced or removed.
 */

export type TailorMode = "normal" | "apply_anyway";

export type TailorInput = {
  profile: ResumeProfile;
  resumeText: string;
  posting: { title: string; company: string | null; description: string };
  requirements: Requirement[];
  results: RequirementResult[];
  mode: TailorMode;
};

const BulletsOut = z.array(z.object({ text: z.string(), sourceBulletIds: z.array(z.string()) }));
const ResumeOut = z.object({
  summary: z.string().nullable(),
  skills: z.array(z.string()),
  experience: z.array(z.object({ sourceId: z.string(), bullets: BulletsOut })),
  projects: z.array(z.object({ sourceId: z.string(), bullets: BulletsOut })),
  sectionOrder: z.array(z.enum(SECTION_KEYS)),
});
const LetterOut = z.object({ greeting: z.string(), paragraphs: z.array(z.string()), closing: z.string() });

const HONESTY = `Absolute rules (a program checks every line and deletes what breaks them):
- Never add an employer, job title, date, school, degree, certification, technology, tool, number or result that isn't in the resume.
- Every bullet lists in sourceBulletIds the id(s) of the original bullet(s) it rewrites. A rewrite may only use facts from those bullets.
- Numbers must be copied exactly from the cited bullets. Don't estimate, round or invent metrics.
- Skills: only skills the resume lists or clearly uses.
- Plain, specific wording. No buzzwords, no exaggeration ("expert", "world-class", "revolutionized").`;

const RESUME_SYSTEM = (mode: TailorMode) => `You tailor a resume to one job posting for a Canadian job search.
What you may do: choose and reorder bullets so the most relevant come first; reword a bullet to use the posting's vocabulary for the same thing (e.g. "REST endpoints" → "REST APIs") when the original supports it; merge two bullets about the same work; leave out projects and bullets that don't help; reorder skills by relevance; write a 2–3 sentence summary from facts in the resume.
- experience: include every job (by sourceId), 2–5 bullets each, most relevant first.
- projects: the 2–4 most relevant, by sourceId.
- sectionOrder: put "education" first only if the person has under a year of work experience; otherwise ["experience", "projects", "education"].
${mode === "apply_anyway" ? "- This person is applying even though they don't meet every requirement. Lead with transferable experience that is genuinely related to the missing requirements. Don't hide or paper over gaps, and never imply they have what they don't." : ""}
${HONESTY}`;

const LETTER_SYSTEM = (mode: TailorMode) => `You write a cover letter for one job posting, in Canadian English, from the applicant's resume.
- 3–4 short paragraphs, under 350 words in total. greeting like "Dear Hiring Manager," unless the posting names a person. closing like "Sincerely,".
- Paragraph 1: the role and one concrete reason they fit. Middle: two or three specific examples from the resume that match the posting's needs. Last: a brief, polite close.
- You may mention the company and what the posting says about the role. You may say they're keen to learn something the posting asks for, but never say or suggest they have experience with something the resume doesn't show.
${mode === "apply_anyway" ? "- They don't meet every requirement. Address the main gap once, honestly and briefly: name the closest related experience from the resume and how they would close the gap. Don't apologize at length." : ""}
${HONESTY}`;

function resumeForPrompt(p: ResumeProfile): string {
  const entry = (e: ResumeProfile["experience"][number]) =>
    `[${e.id}] ${e.organization}${e.title ? ` — ${e.title}` : ""}${e.start || e.end ? ` (${[e.start, e.end].filter(Boolean).join(" – ")})` : ""}\n${e.bullets.map((b) => `  [${b.id}] ${b.text}`).join("\n")}`;
  return [
    p.summary ? `SUMMARY: ${p.summary}` : "",
    `EXPERIENCE:\n${p.experience.map(entry).join("\n") || "(none)"}`,
    `PROJECTS:\n${p.projects.map(entry).join("\n") || "(none)"}`,
    `EDUCATION:\n${p.education.map(entry).join("\n") || "(none)"}`,
    `SKILLS: ${p.skills.join(", ") || "(none)"}`,
    p.certifications.length ? `CERTIFICATIONS: ${p.certifications.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function fitForPrompt(requirements: Requirement[], results: RequirementResult[]): string {
  const byId = new Map(results.map((r) => [r.requirementId, r]));
  return requirements.map((r) => `- [${r.kind}] ${r.text}: ${byId.get(r.id)?.status ?? "missing"}`).join("\n");
}

function postingForPrompt(p: TailorInput["posting"]): string {
  return `${p.title}${p.company ? ` at ${p.company}` : ""}\n"""\n${p.description.slice(0, 12_000)}\n"""`;
}

const retryNote = (issues: GuardIssue[]) =>
  issues.length
    ? `\n\nYour previous attempt had lines rejected by the accuracy check. Fix these:\n${issues.slice(0, 15).map((i) => `- "${i.text.slice(0, 160)}": ${i.reason}`).join("\n")}`
    : "";

export type TailorResult<T> = { ok: true; doc: T; issues: GuardIssue[] } | { ok: false; error: string };

export async function tailorResume(llm: LLMProvider, input: TailorInput): Promise<TailorResult<TailoredResumeDoc>> {
  if (!llm.enabled) return { ok: false, error: "Tailoring needs AI. Set ANTHROPIC_API_KEY on the server." };
  const user = `JOB POSTING:\n${postingForPrompt(input.posting)}\n\nREQUIREMENTS AND HOW THE RESUME MEETS THEM:\n${fitForPrompt(input.requirements, input.results)}\n\nRESUME (ids in brackets):\n${resumeForPrompt(input.profile)}`;
  let last: { doc: TailoredResumeDoc; issues: GuardIssue[] } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await llm.structured({ tier: "smart", system: RESUME_SYSTEM(input.mode), user: user + retryNote(last?.issues ?? []), schema: ResumeOut, maxTokens: 8000 });
    if (!res.ok) {
      if (last) break;
      return { ok: false, error: res.reason };
    }
    const guarded = guardResume(res.data as AiTailoredResume, input.profile, input.resumeText);
    if (!last || guarded.issues.length <= last.issues.length) last = guarded;
    if (!guarded.issues.length) break;
  }
  return { ok: true, ...last! };
}

export async function tailorCoverLetter(llm: LLMProvider, input: TailorInput): Promise<TailorResult<CoverLetterDoc>> {
  if (!llm.enabled) return { ok: false, error: "Writing a cover letter needs AI. Set ANTHROPIC_API_KEY on the server." };
  const user = `JOB POSTING:\n${postingForPrompt(input.posting)}\n\nREQUIREMENTS AND HOW THE RESUME MEETS THEM:\n${fitForPrompt(input.requirements, input.results)}\n\nRESUME:\n${resumeForPrompt(input.profile)}`;
  const posting = { text: input.posting.description, company: input.posting.company, title: input.posting.title };
  let last: { doc: CoverLetterDoc; issues: GuardIssue[] } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await llm.structured({ tier: "smart", system: LETTER_SYSTEM(input.mode), user: user + retryNote(last?.issues ?? []), schema: LetterOut, maxTokens: 4000 });
    if (!res.ok) {
      if (last) break;
      return { ok: false, error: res.reason };
    }
    const guarded = guardCoverLetter(res.data as AiCoverLetter, input.profile, input.resumeText, posting);
    if (!last || guarded.issues.length <= last.issues.length) last = guarded;
    if (!guarded.issues.length) break;
  }
  return { ok: true, ...last! };
}
