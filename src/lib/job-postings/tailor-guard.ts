import { clean } from "@/lib/text/match";
import { numbersIn, unknownNumbers, unknownTerms } from "@/lib/text/terms";
import type { CoverLetterDoc, DocEntry, DocHeader, GuardIssue, SectionKey, TailoredResumeDoc } from "./documents";
import { inResume } from "./resume";
import { skillsIn } from "./taxonomy";
import type { ResumeEntry, ResumeProfile } from "./types";

/**
 * The server's check on tailored writing: reframe, never invent. Facts are copied from
 * the parsed resume. Every bullet must cite the original bullets it rewrites, and may
 * not add numbers, names or technologies those originals (or the resume) don't have.
 * A cover letter may name the posting's technologies, but never claim experience with
 * one the resume doesn't show. Whatever fails is replaced with the original or removed,
 * and reported.
 */

export type AiTailoredResume = {
  summary: string | null;
  skills: string[];
  experience: { sourceId: string; bullets: { text: string; sourceBulletIds: string[] }[] }[];
  projects: { sourceId: string; bullets: { text: string; sourceBulletIds: string[] }[] }[];
  sectionOrder: SectionKey[];
};

export type AiCoverLetter = { greeting: string; paragraphs: string[]; closing: string };

const MAX_BULLET = 300;
const KEEP_WHEN_OMITTED = 3;

export function headerFrom(profile: ResumeProfile): DocHeader {
  return { name: profile.name, email: profile.email, phone: profile.phone, location: profile.location, links: profile.links.slice(0, 8) };
}

const copyEntry = (e: ResumeEntry, bullets: DocEntry["bullets"]): DocEntry => ({
  sourceId: e.id,
  organization: e.organization,
  title: e.title,
  start: e.start,
  end: e.end,
  location: e.location,
  bullets,
});

/** Checks one rewritten bullet against the bullets it cites. Returns a reason, or null if it's fine. */
export function checkBullet(text: string, cited: string[], resumeText: string): string | null {
  if (!text.trim()) return "empty";
  if (text.length > MAX_BULLET) return `longer than ${MAX_BULLET} characters`;
  if (!cited.length) return "doesn't say which original line it rewrites";
  const source = cited.join("\n");
  const nums = unknownNumbers(text, source);
  if (nums.length) return `adds the number ${nums[0]}, which the original line doesn't have`;
  const terms = unknownTerms(text, resumeText);
  if (terms.length) return `mentions “${terms[0]}”, which isn't in your resume`;
  return null;
}

export function guardResume(ai: AiTailoredResume, profile: ResumeProfile, resumeText: string): { doc: TailoredResumeDoc; issues: GuardIssue[] } {
  const issues: GuardIssue[] = [];
  const bulletText = new Map<string, string>();
  for (const e of [...profile.experience, ...profile.projects, ...profile.education]) for (const b of e.bullets) bulletText.set(b.id, b.text);
  const rawClean = clean(resumeText);

  const section = (key: "experience" | "projects", source: ResumeEntry[], written: AiTailoredResume["experience"]): DocEntry[] => {
    const byId = new Map(source.map((e) => [e.id, e]));
    const out: DocEntry[] = [];
    const seen = new Set<string>();
    for (const w of written) {
      const entry = byId.get(w.sourceId);
      if (!entry) {
        issues.push({ where: key, text: w.sourceId, reason: "refers to an entry that isn't in your resume", action: "removed" });
        continue;
      }
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      const bullets: DocEntry["bullets"] = [];
      for (const b of w.bullets) {
        const ids = [...new Set(b.sourceBulletIds)].filter((id) => bulletText.has(id));
        const reason = checkBullet(b.text, ids.map((id) => bulletText.get(id)!), resumeText);
        if (!reason) {
          bullets.push({ text: b.text.trim(), sourceBulletIds: ids });
          continue;
        }
        const fallback = ids.length === 1 ? bulletText.get(ids[0]) : undefined;
        if (fallback && !bullets.some((x) => x.text === fallback)) {
          bullets.push({ text: fallback, sourceBulletIds: ids });
          issues.push({ where: `${entry.organization}`, text: b.text, reason, action: "replaced_with_original" });
        } else {
          issues.push({ where: `${entry.organization}`, text: b.text, reason, action: "removed" });
        }
      }
      out.push(copyEntry(entry, bullets.length ? bullets : entry.bullets.slice(0, KEEP_WHEN_OMITTED).map((b) => ({ text: b.text, sourceBulletIds: [b.id] }))));
    }
    // Jobs are never dropped: leaving one out would open an unexplained gap.
    if (key === "experience") {
      for (const e of source) if (!seen.has(e.id)) out.push(copyEntry(e, e.bullets.slice(0, KEEP_WHEN_OMITTED).map((b) => ({ text: b.text, sourceBulletIds: [b.id] }))));
      const order = new Map(source.map((e, i) => [e.id, i]));
      out.sort((a, b) => order.get(a.sourceId)! - order.get(b.sourceId)!);
    }
    return out;
  };

  const skills: string[] = [];
  for (const s of ai.skills) {
    if (inResume(rawClean, s)) {
      if (!skills.some((x) => clean(x) === clean(s))) skills.push(s.trim());
    } else issues.push({ where: "Skills", text: s, reason: "isn't in your resume", action: "removed" });
  }

  let summary: string | null = ai.summary?.trim() || null;
  if (summary) {
    const terms = unknownTerms(summary, resumeText);
    const nums = unknownNumbers(summary, resumeText);
    if (terms.length || nums.length || summary.length > 600) {
      issues.push({
        where: "Summary",
        text: summary,
        reason: terms.length ? `mentions “${terms[0]}”, which isn't in your resume` : nums.length ? `adds the number ${nums[0]}` : "too long",
        action: profile.summary ? "kept_original" : "removed",
      });
      summary = profile.summary;
    }
  }

  const order = [...new Set([...ai.sectionOrder.filter((k) => k !== "education"), "experience" as const, "projects" as const])];
  const built = {
    experience: section("experience", profile.experience, ai.experience),
    projects: section("projects", profile.projects, ai.projects),
    education: profile.education.map((e) => copyEntry(e, e.bullets.map((b) => ({ text: b.text, sourceBulletIds: [b.id] })))),
  };
  // Education goes first for students and new grads with little experience, otherwise last.
  const educationFirst = ai.sectionOrder[0] === "education";
  const keys: SectionKey[] = educationFirst ? ["education", ...order] : [...order, "education"];
  return {
    doc: {
      header: headerFrom(profile),
      summary,
      skills: (skills.length ? skills : profile.skills).slice(0, 40),
      sections: keys.map((key) => ({ key, entries: built[key] })).filter((s) => s.entries.length),
      certifications: profile.certifications,
    },
    issues,
  };
}

// ------------------------------------------------------------------ cover letter

/** Says the writer has done, used or knows something, as opposed to wanting to learn it. */
const CLAIM =
  /\b(i have|i've|i had|i am (proficient|experienced|skilled|familiar|fluent|certified)|i'm (proficient|experienced|skilled|familiar|fluent|certified)|my (experience|expertise|background|work) (with|in|using)|experience (with|in|using)|proficien(t|cy)|expertise|skilled (in|with)|hands-on|worked (with|on)|built|developed|designed|implemented|deployed|used|using|led|managed|wrote|created|engineered|delivered|shipped)\b/i;
const LEARNING = /\b(learn|learning|eager to|keen to|excited to|looking forward to|hope to|grow|growing|develop my|build my|ramp up|pick up|new to|not yet|haven't yet)\b/i;

/** Checks one cover-letter sentence. Returns a reason, or null if it's fine. */
export function checkLetterSentence(sentence: string, resumeText: string, posting: { text: string; company: string | null; title: string }): string | null {
  const allowed = [posting.company ?? "", posting.title];
  const fromPostingOrResume = `${resumeText}\n${posting.text}\n${posting.company ?? ""}\n${posting.title}`;
  const unknown = unknownTerms(sentence, fromPostingOrResume, allowed);
  if (unknown.length) return `mentions “${unknown[0]}”, which isn't in your resume or the posting`;

  const claims = CLAIM.test(sentence) && !LEARNING.test(sentence);
  // Skills compare by what they are, not how they're written: "Postgres" in the resume covers "PostgreSQL".
  const resumeSkills = new Set(skillsIn(resumeText).map((s) => s.name));
  const missingSkills = skillsIn(sentence)
    .filter((s) => !resumeSkills.has(s.name))
    .map((s) => s.name);
  const resumeClean = clean(resumeText);
  const otherTerms = unknownTerms(sentence, resumeText, allowed).filter((t) => skillsIn(t).length === 0 && !resumeClean.includes(` ${clean(t).trim()} `));
  const postingOnly = [...new Set([...missingSkills, ...otherTerms])];
  if (claims && postingOnly.length) return `claims experience with “${postingOnly[0]}”, which your resume doesn't show`;

  const extraNumbers = numbersIn(sentence).filter((n) => !numbersIn(resumeText).includes(n));
  if (extraNumbers.length && (claims || !numbersIn(posting.text).includes(extraNumbers[0]))) return `states the number ${extraNumbers[0]}, which isn't in your resume`;
  return null;
}

export function guardCoverLetter(
  ai: AiCoverLetter,
  profile: ResumeProfile,
  resumeText: string,
  posting: { text: string; company: string | null; title: string },
): { doc: CoverLetterDoc; issues: GuardIssue[] } {
  const issues: GuardIssue[] = [];
  const paragraphs: string[] = [];
  ai.paragraphs.forEach((p, i) => {
    const kept: string[] = [];
    for (const sentence of p.split(/(?<=[.!?])\s+(?=[A-Z"“(])/)) {
      const s = sentence.trim();
      if (!s) continue;
      const reason = checkLetterSentence(s, resumeText, posting);
      if (reason) issues.push({ where: `Paragraph ${i + 1}`, text: s, reason, action: "removed" });
      else kept.push(s);
    }
    if (kept.length) paragraphs.push(kept.join(" "));
  });
  const greeting = /^dear\b/i.test(ai.greeting.trim()) && !checkLetterSentence(ai.greeting, resumeText, posting) ? ai.greeting.trim() : "Dear Hiring Manager,";
  return {
    doc: {
      header: headerFrom(profile),
      company: posting.company,
      jobTitle: posting.title,
      greeting,
      paragraphs: paragraphs.length ? paragraphs : ["(Every sentence was removed by the accuracy check. Write this letter yourself, or regenerate it.)"],
      closing: /^(sincerely|regards|best regards|kind regards|thank you),?$/i.test(ai.closing.trim()) ? ai.closing.trim().replace(/,?$/, ",") : "Sincerely,",
      signature: profile.name,
    },
    issues,
  };
}
