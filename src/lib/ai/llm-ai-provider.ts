import "server-only";
import type { LLMProvider } from "@/lib/discovery/llm";
import { AiResume } from "@/lib/job-postings/resume";
import type { Requirement, RequirementResult, ResumeProfile } from "@/lib/job-postings/types";
import { AiCoverLetterSchema, AiJobAnalysisSchema, AiNotesSchema, AiPostingSchema, AiTailoredResumeSchema, type AIProvider, type AiResult, type JobContext, type TailorMode } from "./provider";

/**
 * The AIProvider on any model service behind the app's LLMProvider: Gemini by default,
 * Anthropic Claude optionally, the user's own key or the server's. Every call asks for
 * structured output checked against a schema. The prompts set the rules; the callers
 * enforce them with the accuracy guard, so a prompt is never the only safeguard.
 */

const HONESTY = `Absolute rules (a program checks every line and deletes what breaks them):
- Never add an employer, job title, date, school, degree, certification, technology, tool, number, metric or result that isn't in the resume.
- Every bullet lists in sourceBulletIds the id(s) of the original bullet(s) it rewrites. A rewrite may only use facts from those bullets.
- Numbers must be copied exactly from the cited bullets. Don't estimate, round or invent metrics.
- Skills: only skills the resume lists or clearly uses. A skill the job wants that the resume doesn't show must not appear anywhere.
- Plain, specific wording. No buzzwords, no exaggeration ("expert", "world-class", "revolutionized").`;

const PARSE_SYSTEM = `You convert resume text into structured data. Copy text exactly as written: do not reword, fix, summarize, merge or invent anything.
- experience: paid roles, co-ops and internships. organization = employer, title = job title.
- education: organization = school, title = degree and program line as written (e.g. "Diploma, Computer Systems Technology"); degree = the degree words only ("Diploma", "Bachelor of Applied Science"); major = the program ("Computer Systems Technology"); graduation = the completion or expected date exactly as written ("Apr 2027", "Expected 2027"), or null if the text doesn't say which date it is.
- projects: organization = project name, title = role or tech line if present.
- awards: awards, honours and scholarships. activities: extracurricular, volunteer, club and leadership roles.
- bullets: each bullet or sentence under an entry, verbatim.
- skills: individual skills, tools, languages, frameworks, as listed.
- certifications: certifications and licences, verbatim.
- degree, major and graduation are null outside education.
Use null for anything not in the text. Never guess a date, a degree or a link.`;

const ANALYSIS_SYSTEM = `You read one job posting and list what it asks for. Copy each item exactly as the posting words it (a short phrase or the whole line); a program drops anything it can't find in the posting.
- requiredSkills / preferredSkills: technologies, tools, languages and methods, split by whether the posting requires or prefers them.
- responsibilities: what the person will do.
- requiredQualifications / preferredQualifications: years of experience, education, licences, work authorization and similar.
- keywords: the 10–20 exact phrases an applicant-tracking system would most likely match, most important first.`;

const TAILOR_SYSTEM = (mode: TailorMode, format: "resume" | "cv") => `You tailor a ${format === "cv" ? "CV" : "resume"} to one job posting for a Canadian job search. The result must be clearly more specific to this job than the original, while staying completely true.
What to do:
- Rewrite every relevant bullet so it uses the posting's own vocabulary for the same work (e.g. "backend functionality" → "REST APIs in Python" when the original names Python and APIs), leads with the skill or outcome the job cares about, and is clear and specific. Keep each bullet's facts; change its wording.
- Put the most relevant bullets first in each entry.${format === "cv" ? " Keep every bullet (a CV is complete): reword and reorder them, don't drop any." : " Leave out bullets that don't help this application (keep at least 2 per job)."}
- Reorder skills so those the posting asks for (and the resume has) come first, using the posting's spelling of a skill the resume lists under another name.
- Write a 2–3 sentence summary aimed at this role, using only facts from the resume.
- experience: include every job (by sourceId).
- projects: ${format === "cv" ? "include every project (by sourceId), most relevant first" : "the 2–4 most relevant, by sourceId, most relevant first"}.
- sectionOrder: put "education" first only if the person has under a year of work experience; otherwise ["experience", "projects", "education"].
${mode === "apply_anyway" ? "- This person is applying even though they don't meet every requirement. Lead with transferable experience that is genuinely related to the missing requirements. Don't hide gaps, and never imply they have what they don't." : ""}
${HONESTY}`;

const LETTER_SYSTEM = (mode: TailorMode) => `You write a cover letter for one job posting, in Canadian English, from the applicant's resume.
- 3–4 short paragraphs, under 350 words in total. greeting like "Dear Hiring Manager," unless the posting names a person. closing like "Sincerely,".
- Paragraph 1: the role and one concrete reason they fit. Middle: two or three specific examples from the resume that match the posting's needs. Last: a brief, polite close.
- You may mention the company and what the posting says about the role. You may say they're keen to learn something the posting asks for, but never say or suggest they have experience with something the resume doesn't show.
${mode === "apply_anyway" ? "- They don't meet every requirement. Address the main gap once, honestly and briefly: name the closest related experience from the resume and how they would close the gap. Don't apologize at length." : ""}
${HONESTY}`;

const NOTES_SYSTEM = `You advise a job seeker how to improve their own resume for one job. You don't rewrite it; you tell them what to change and why.
- Add specific advice the rule-based notes below don't already give, mostly about individual bullets: which bullet (target = its id) undersells relevant work, and what the job's language for it is.
- Say "If accurate, …" before any suggestion to add detail. Never suggest numbers, results or metrics yourself; suggest they add their own if they have them.
- Never suggest adding a skill, technology, employer, degree or certification the resume doesn't show. For a requirement they lack, say it's missing and that they shouldn't add it unless they genuinely have it.
- Every note has a short "why" tied to the posting (e.g. which requirement or how often the posting mentions it).
- At most 8 notes. priority: high (relevant experience buried, required qualification not clearly shown), medium (wording could be more specific, ordering), optional (minor wording).`;

const POSTING_SYSTEM = `You read the text of one job page that a person copied from a website (LinkedIn, Indeed, a company's careers page…). It may include menus and other page clutter.
- title: the job title, copied exactly as the page writes it.
- company: the hiring company's name, copied exactly.
- location: the job's location exactly as written (e.g. "Toronto, ON" or "Remote - EMEA").
Use null for anything the text doesn't state. Never guess, translate or reword; a program drops any value it can't find in the text.`;

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

const postingForPrompt = (p: JobContext["posting"]) => `${p.title}${p.company ? ` at ${p.company}` : ""}\n"""\n${p.description.slice(0, 12_000)}\n"""`;

const jobPrompt = (input: JobContext, withIds = true) =>
  `JOB POSTING:\n${postingForPrompt(input.posting)}\n\nKEYWORDS THE POSTING EMPHASIZES: ${input.keywords.join(", ") || "(none found)"}\n\nREQUIREMENTS AND HOW THE RESUME MEETS THEM:\n${fitForPrompt(input.requirements, input.results)}\n\nRESUME${withIds ? " (ids in brackets)" : ""}:\n${resumeForPrompt(input.profile)}`;

const withFeedback = (user: string, feedback?: string) => (feedback ? `${user}\n\nFEEDBACK ON YOUR PREVIOUS ATTEMPT (fix this):\n${feedback}` : user);

export class LlmAIProvider implements AIProvider {
  constructor(
    private readonly llm: LLMProvider,
    /** For the UI: "Google Gemini". */
    readonly name: string,
  ) {}

  parseResume(text: string): Promise<AiResult<AiResume>> {
    return this.llm.structured({ tier: "fast", system: PARSE_SYSTEM, user: `Resume text:\n"""\n${text}\n"""`, schema: AiResume, maxTokens: 12_000 });
  }

  extractJobRequirements(posting: { title: string; description: string }) {
    return this.llm.structured({ tier: "fast", system: ANALYSIS_SYSTEM, user: `${posting.title}\n"""\n${posting.description.slice(0, 12_000)}\n"""`, schema: AiJobAnalysisSchema, maxTokens: 4000 });
  }

  tailorResume(input: JobContext, feedback?: string) {
    return this.llm.structured({ tier: "smart", system: TAILOR_SYSTEM(input.mode, "resume"), user: withFeedback(jobPrompt(input), feedback), schema: AiTailoredResumeSchema, maxTokens: 8000 });
  }

  tailorCV(input: JobContext, feedback?: string) {
    return this.llm.structured({ tier: "smart", system: TAILOR_SYSTEM(input.mode, "cv"), user: withFeedback(jobPrompt(input), feedback), schema: AiTailoredResumeSchema, maxTokens: 10_000 });
  }

  generateCoverLetter(input: JobContext, feedback?: string) {
    return this.llm.structured({ tier: "smart", system: LETTER_SYSTEM(input.mode), user: withFeedback(jobPrompt(input, false), feedback), schema: AiCoverLetterSchema, maxTokens: 4000 });
  }

  parsePosting(text: string) {
    return this.llm.structured({ tier: "fast", system: POSTING_SYSTEM, user: `Page text:\n"""\n${text.slice(0, 20_000)}\n"""`, schema: AiPostingSchema, maxTokens: 1000 });
  }

  generateResumeImprovementNotes(input: JobContext & { ruleNotes: string }) {
    return this.llm.structured({
      tier: "smart",
      system: NOTES_SYSTEM,
      user: `${jobPrompt(input)}\n\nNOTES ALREADY GIVEN (don't repeat them):\n${input.ruleNotes}`,
      schema: AiNotesSchema,
      maxTokens: 4000,
    });
  }
}
