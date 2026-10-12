import type { CoverLetterDoc, GuardIssue } from "./documents";
import { guardCoverLetter } from "./tailor-guard";
import { skillsIn, wordingIn, type Skill } from "./taxonomy";
import type { Requirement, RequirementResult, ResumeEntry, ResumeProfile } from "./types";

/**
 * Without AI. Nothing here produces a "tailored resume": reordering someone's lines isn't
 * tailoring, so when AI isn't available the app gives Improvement Notes instead. What's
 * left is a cover-letter template filled with their matched experience (labelled as a
 * template), and the alias swap ("Postgres" → "PostgreSQL") the notes suggest.
 */

export type SmartInput = {
  profile: ResumeProfile;
  resumeText: string;
  years: number;
  posting: { title: string; company: string | null; description: string };
  requirements: Requirement[];
  results: RequirementResult[];
  /** Per resume line: how close it is to the job's requirements (0–1), when embeddings are on. */
  relevance: Map<string, number>;
  mode: "normal" | "apply_anyway";
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces the resume's name for each shared skill with the posting's, whole-word only. */
export function alignWording(text: string, postingSkills: Skill[], postingText: string): { text: string; aligned: string[] } {
  let out = text;
  const aligned: string[] = [];
  for (const skill of postingSkills) {
    const mine = wordingIn(out, skill);
    const theirs = wordingIn(postingText, skill);
    if (!mine || !theirs || mine.toLowerCase() === theirs.toLowerCase()) continue;
    // Only swap a single name for a single name (not "C/C++" for "C++").
    if (/[/,]/.test(mine) || /[/,]/.test(theirs)) continue;
    out = out.replace(new RegExp(`(?<![A-Za-z0-9+#])${escapeRe(mine)}(?![A-Za-z0-9+#])`, "g"), theirs);
    aligned.push(theirs);
  }
  return { text: out, aligned };
}

// ------------------------------------------------------------------ cover letter

const PAST_TENSE_IRREGULAR = new Set("built wrote led ran made set took drove grew cut won began kept found taught sold spoke brought chose shipped".split(" "));

/** "Built REST APIs" → "built REST APIs", so it reads "At Acme, I built REST APIs." */
function asClause(bullet: string): string | null {
  const first = bullet.split(/\s+/)[0] ?? "";
  const w = first.toLowerCase().replace(/[^a-z]/g, "");
  if (!(w.endsWith("ed") || PAST_TENSE_IRREGULAR.has(w))) return null;
  return `${first.toLowerCase()}${bullet.slice(first.length)}`.replace(/[.;\s]+$/, "");
}

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

export function smartCoverLetter(input: SmartInput): { doc: CoverLetterDoc; issues: GuardIssue[] } {
  const { profile, posting } = input;
  const reqById = new Map(input.requirements.map((r) => [r.id, r]));
  const entryOf = new Map<string, ResumeEntry>();
  for (const e of [...profile.experience, ...profile.projects]) for (const b of e.bullets) entryOf.set(b.text, e);

  // The strongest real lines: met required ones first, each used once.
  const strengths: string[] = [];
  const used = new Set<string>();
  const met = input.results
    .filter((r) => r.status === "met" && r.quote && entryOf.has(r.quote))
    .sort((a, b) => Number(reqById.get(b.requirementId)?.kind === "must") - Number(reqById.get(a.requirementId)?.kind === "must"));
  for (const r of met) {
    if (strengths.length >= 3 || used.has(r.quote!)) continue;
    used.add(r.quote!);
    const entry = entryOf.get(r.quote!)!;
    const clause = asClause(r.quote!);
    const where = profile.projects.includes(entry) ? `In my ${entry.organization} project` : `At ${entry.organization}`;
    strengths.push(clause ? `${where}, I ${clause}.` : `${where}: ${r.quote!.replace(/[.;\s]+$/, "")}.`);
  }

  const resumeSkills = new Set(skillsIn(input.resumeText).map((s) => s.name));
  const postingSkills = skillsIn(posting.description);
  const shared = postingSkills.filter((s) => resumeSkills.has(s.name)).slice(0, 3).map((s) => wordingIn(input.resumeText, s) ?? s.name);
  const missingMust = input.requirements
    .filter((r) => r.kind === "must" && r.category === "skill" && input.results.find((x) => x.requirementId === r.id)?.status === "missing")
    .flatMap((r) => skillsIn(r.text).filter((s) => !resumeSkills.has(s.name)).map((s) => s.name));

  const at = posting.company ? ` at ${posting.company}` : "";
  const paragraphs = [
    `I'm writing to apply for the ${posting.title} position${at}.${shared.length ? ` My background with ${list(shared)} lines up with what the role needs.` : ""}`,
    strengths.length ? strengths.join(" ") : null,
    input.mode === "apply_anyway" && missingMust.length
      ? `I haven't yet worked with ${list([...new Set(missingMust)].slice(0, 3))} professionally, and I'm keen to learn quickly on the job.`
      : null,
    `I'd welcome the chance to talk about how I can contribute${posting.company ? ` to ${posting.company}` : ""}. Thank you for your time and consideration.`,
  ].filter((p): p is string => Boolean(p));

  return guardCoverLetter({ greeting: "Dear Hiring Manager,", paragraphs, closing: "Sincerely," }, profile, input.resumeText, {
    text: posting.description,
    company: posting.company,
    title: posting.title,
  });
}
