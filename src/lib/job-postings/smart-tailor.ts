import type { CoverLetterDoc, DocEntry, GuardIssue, SectionKey, TailoredResumeDoc } from "./documents";
import { checkBullet, guardCoverLetter, headerFrom } from "./tailor-guard";
import { skillsIn, wordingIn, type Skill } from "./taxonomy";
import type { Requirement, RequirementResult, ResumeEntry, ResumeProfile } from "./types";

/**
 * Tailoring without AI. The resume keeps only the person's own lines: the most
 * relevant bullets come first, irrelevant projects are left out, matched skills lead.
 * The one wording change is to use the posting's name for a skill the resume already
 * has under another name ("Postgres" → "PostgreSQL"). The cover letter is a template
 * filled with their matched experience, for them to personalise.
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

const BULLETS_PER_JOB = 5;
const MIN_BULLETS = 2;
const PROJECTS_KEPT = 3;

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

function relevanceOf(text: string, id: string, input: SmartInput, postingSkills: Set<string>, quoted: Set<string>): number {
  const skillHits = skillsIn(text).filter((s) => postingSkills.has(s.name)).length;
  return skillHits * 2 + (input.relevance.get(id) ?? 0) * 3 + (quoted.has(text) ? 2 : 0);
}

export function smartTailorResume(input: SmartInput): { doc: TailoredResumeDoc; issues: GuardIssue[] } {
  const { profile, posting } = input;
  const postingSkillList = skillsIn(`${posting.title}\n${posting.description}`);
  const postingSkills = new Set(postingSkillList.map((s) => s.name));
  const quoted = new Set(input.results.filter((r) => r.status !== "missing" && r.quote).map((r) => r.quote!));
  const issues: GuardIssue[] = [];
  const allowed: string[] = [];

  const toDoc = (e: ResumeEntry, keep: number): DocEntry => {
    const ranked = e.bullets
      .map((b, i) => ({ b, i, score: relevanceOf(b.text, b.id, input, postingSkills, quoted) }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, Math.max(MIN_BULLETS, keep));
    const bullets = ranked.map(({ b }) => {
      const { text, aligned } = alignWording(b.text, postingSkillList, posting.description);
      allowed.push(...aligned);
      return { text, sourceBulletIds: [b.id] };
    });
    return { sourceId: e.id, organization: e.organization, title: e.title, start: e.start, end: e.end, location: e.location, bullets };
  };

  const experience = profile.experience.map((e) => toDoc(e, BULLETS_PER_JOB));
  const projects = profile.projects
    .map((p, i) => ({ p, i, score: p.bullets.reduce((s, b) => s + relevanceOf(b.text, b.id, input, postingSkills, quoted), relevanceOf(p.organization, p.id, input, postingSkills, quoted)) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    // Only relevant projects when there are any; otherwise the first two.
    .filter((x, rank, all) => (all[0].score > 0 ? x.score > 0 : rank < 2))
    .slice(0, PROJECTS_KEPT)
    .sort((a, b) => a.i - b.i)
    .map(({ p }) => toDoc(p, 3));
  const education = profile.education.map((e) => ({ ...toDoc(e, e.bullets.length), bullets: e.bullets.map((b) => ({ text: b.text, sourceBulletIds: [b.id] })) }));

  // Matched skills first, in the posting's wording; then the rest in their original order.
  const skills = profile.skills
    .map((s, i) => {
      const { text, aligned } = alignWording(s, postingSkillList, posting.description);
      allowed.push(...aligned);
      return { text, i, matched: skillsIn(s).some((k) => postingSkills.has(k.name)) };
    })
    .sort((a, b) => Number(b.matched) - Number(a.matched) || a.i - b.i)
    .map((x) => x.text);

  // A last check that nothing new slipped in (only the aligned skill names are allowed).
  const known = `${input.resumeText}\n${allowed.join("\n")}`;
  const bulletText = new Map([...profile.experience, ...profile.projects, ...profile.education].flatMap((e) => e.bullets.map((b) => [b.id, b.text] as const)));
  for (const entry of [...experience, ...projects]) {
    entry.bullets = entry.bullets.map((b) => {
      const original = bulletText.get(b.sourceBulletIds[0]) ?? "";
      const reason = b.text === original ? null : checkBullet(b.text, [`${original}\n${allowed.join("\n")}`], known);
      if (!reason) return b;
      issues.push({ where: entry.organization, text: b.text, reason, action: "replaced_with_original" });
      return { ...b, text: original };
    });
  }

  const order: SectionKey[] = input.years < 1 ? ["education", "experience", "projects"] : ["experience", "projects", "education"];
  const built: Record<SectionKey, DocEntry[]> = { experience, projects, education };
  return {
    doc: {
      header: headerFrom(profile),
      summary: profile.summary,
      skills: skills.slice(0, 40),
      sections: order.map((key) => ({ key, entries: built[key] })).filter((s) => s.entries.length),
      certifications: profile.certifications,
    },
    issues,
  };
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
