import { z } from "zod";
import type { AIProvider } from "@/lib/ai/provider";
import { clean } from "@/lib/text/match";
import { DEGREE_LEVELS, ResumeProfile, type DegreeLevel, type ResumeContact, type ResumeEntry } from "./types";

/**
 * Turns resume text into a ResumeProfile. A heading-based parser reads it without AI;
 * every value it fills is copied from the text. With AI, the model structures it too, and
 * anything it returns that isn't in the text is dropped (see groundAiResume).
 * How sure we are about each field is worked out in resume-fields.ts.
 */

export const MAX_RESUME_TEXT = 60_000;

export type SectionKey = "experience" | "education" | "projects" | "skills" | "certifications" | "summary" | "awards" | "activities";

const HEADINGS: [SectionKey, RegExp][] = [
  ["experience", /^(work |professional |relevant |employment |industry |co op |coop )?(experience|employment|history|work history)( history)?$/],
  ["education", /^(education|academic background|education and training)$/],
  ["projects", /^(technical |personal |academic |selected |relevant )?projects?( experience)?$/],
  ["skills", /^(technical |core |key )?(skills|technologies|competencies|skills and (tools|technologies|interests)|tools and technologies)$/],
  ["certifications", /^(certifications?|licen[cs]es?( and certifications?)?|certifications? and licen[cs]es?|certificates)$/],
  ["summary", /^(summary|profile|professional summary|objective|career objective|about me)$/],
  ["awards", /^(awards?|honou?rs|honou?rs and awards|awards and honou?rs|achievements|scholarships?( and awards)?|awards and scholarships)$/],
  ["activities", /^(extracurricular|extracurricular activities|extra curricular activities|activities|leadership|leadership experience|leadership and activities|volunteer|volunteering|volunteer experience|community involvement|involvement|clubs and organizations)$/],
];

export const BULLET = /^[•\-*▪●◦–·‣⁃■□➢►✓]\s*/;
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4})`;
const DATE_RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|present|current|now|ongoing)`, "i");
const SINGLE_DATE = new RegExp(`((?:expected|anticipated|exp\\.?)\\s+)?(${MONTH}\\s+\\d{4}|\\d{4})\\s*\\)?$`, "i");
export const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]*\w/g;
export const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
// Not preceded by "@" or a word character, so the domain of an email address isn't read as a link.
export const LINK = /(?<![@\w.-])(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/[\w%-]+|github\.com\/[\w-]+(?:\/[\w.-]+)?|[\w-]+(?:\.[\w-]+)*\.(?:dev|io|me|ca|com|net|org|app|site|page)(?:\/[\w/#.-]*)?)/gi;
const CA_LOCATION = /^[A-Z][\w .'-]+,\s*(BC|ON|AB|QC|MB|SK|NS|NB|NL|PE|YT|NT|NU|British Columbia|Ontario|Alberta|Quebec|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Canada)$/;

export function headingOf(line: string): SectionKey | null {
  if (line.length > 45) return null;
  const t = clean(line).trim();
  for (const [key, re] of HEADINGS) if (re.test(t)) return key;
  return null;
}

/** Splits "Acme Corp — Software Developer Intern   May 2023 – Aug 2023" into its parts. */
function splitHeader(line: string): { text: string; start: string | null; end: string | null; expected: boolean } {
  const m = line.match(DATE_RANGE);
  if (m) {
    const text = line.replace(m[0], "").replace(/[|,–—-]\s*$/, "").replace(/\s{2,}/g, " ").trim();
    return { text, start: m[1], end: m[2], expected: false };
  }
  const single = line.match(SINGLE_DATE);
  if (single && line.length > single[0].length + 3) {
    return { text: line.slice(0, single.index).replace(/[|,–—(-]\s*$/, "").trim(), start: null, end: single[2], expected: Boolean(single[1]) };
  }
  return { text: line, start: null, end: null, expected: false };
}

/** Header lines like "Software Developer, Acme Corp" or "Acme Corp | Vancouver, BC". */
function headerParts(lines: string[]): Pick<ResumeEntry, "organization" | "title" | "location"> {
  const parts = lines.flatMap((l) => l.split(/\s+[|•·]\s+|\s{3,}|\s+[–—]\s+/)).map((s) => s.trim()).filter(Boolean);
  const loc = parts.find((p) => /,\s*(BC|ON|AB|QC|MB|SK|NS|NB|NL|PE|Canada|[A-Z]{2})$/.test(p) || /^remote$/i.test(p)) ?? null;
  const rest = parts.filter((p) => p !== loc);
  return { organization: rest[0] ?? lines[0] ?? "", title: rest[1] ?? null, location: loc };
}

const blankEntry = (id: string): ResumeEntry => ({ id, organization: "", title: null, start: null, end: null, location: null, bullets: [], degree: null, major: null, graduation: null });

/** Lines of one section grouped into entries: header lines (name, title, dates) then bullets. */
export function entriesFrom(lines: string[], prefix: string): ResumeEntry[] {
  const entries: ResumeEntry[] = [];
  let header: string[] = [];
  let current: ResumeEntry | null = null;
  let dates: { start: string | null; end: string | null; expected: boolean } = { start: null, end: null, expected: false };

  const flushHeader = () => {
    if (!header.length) return;
    const entry: ResumeEntry = { ...blankEntry(`${prefix}${entries.length + 1}`), ...headerParts(header), start: dates.start, end: dates.end };
    // "Expected Apr 2027" is a graduation date, kept with its wording.
    if (dates.expected && dates.end) entry.graduation = `Expected ${dates.end}`;
    entries.push(entry);
    current = entry;
    header = [];
    dates = { start: null, end: null, expected: false };
  };

  for (const raw of lines) {
    if (BULLET.test(raw)) {
      flushHeader();
      if (!current) {
        current = blankEntry(`${prefix}${entries.length + 1}`);
        entries.push(current);
      }
      const entry: ResumeEntry = current;
      entry.bullets.push({ id: `${entry.id}b${entry.bullets.length + 1}`, text: raw.replace(BULLET, "").trim() });
      continue;
    }
    const entry = current as ResumeEntry | null;
    // A wrapped bullet continues on the next line, usually in lower case.
    if (entry && entry.bullets.length && !header.length && /^[a-z(]/.test(raw)) {
      const last = entry.bullets[entry.bullets.length - 1];
      last.text = `${last.text} ${raw}`.trim();
      continue;
    }
    // A non-bullet line after bullets starts the next entry.
    if (entry && entry.bullets.length && !header.length) current = null;
    const { text, start, end, expected } = splitHeader(raw);
    if (start || end) dates = { start: dates.start ?? start, end: dates.end ?? end, expected: dates.expected || expected };
    if (text) header.push(text);
    if (header.length >= 3) flushHeader();
  }
  flushHeader();
  return entries.filter((e) => e.organization || e.bullets.length);
}

/** Splits "Languages: Python, C++ | Tools: Git" into ["Python", "C++", "Git"]. */
export function splitSkills(lines: string[]): string[] {
  const out = new Set<string>();
  for (const line of lines) {
    const body = line.replace(BULLET, "").replace(/^[^:]{1,40}:\s*/, "");
    for (const s of body.split(/[,;|•·]|\s{2,}/)) {
      const skill = s.trim().replace(/\.$/, "");
      if (skill.length >= 1 && skill.length <= 50) out.add(skill);
    }
  }
  return [...out].slice(0, 120);
}

export type ResumeSections = { header: string[]; sections: Partial<Record<SectionKey, string[]>> };

/** The resume's lines, split into the header (before the first heading) and its sections. */
export function resumeSections(text: string): ResumeSections {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const sections: Partial<Record<SectionKey, string[]>> = {};
  const header: string[] = [];
  let section: SectionKey | null = null;
  for (const line of lines) {
    const h = headingOf(line);
    if (h) {
      section = h;
      sections[h] ??= [];
      continue;
    }
    if (section) sections[section]!.push(line);
    else header.push(line);
  }
  return { header, sections };
}

const NOT_A_NAME = /^(resume|résumé|curriculum vitae|cv)$/i;

/** The first header line that looks like a name: no digits, no email, not "Resume". */
export function nameCandidate(header: string[]): string | null {
  const line = header.find((l) => !NOT_A_NAME.test(l.trim())) ?? "";
  if (!line || line.length > 60) return null;
  const EMAIL_ONE = new RegExp(EMAIL.source);
  if (EMAIL_ONE.test(line) || /\d/.test(line)) return null;
  return line.split(/\s+[|•·]\s+/)[0].trim() || null;
}

/** Every link in a text, without emails, in order of appearance. */
export function linksIn(text: string): string[] {
  return [...new Set([...text.matchAll(LINK)].map((m) => m[0].replace(/[.,)]+$/, "")).filter((l) => !/@/.test(l)))];
}

/** "linkedin.com/in/sam" → linkedin; "github.com/sam" → github; "sam.dev" → website. */
export function classifyLinks(links: string[]): ResumeContact & { githubRepo: string | null } {
  const linkedin = links.find((l) => /linkedin\.com\/in\//i.test(l)) ?? null;
  const githubProfile = links.find((l) => /github\.com\/[\w-]+\/?$/i.test(l)) ?? null;
  const githubRepo = links.find((l) => /github\.com\/[\w-]+\/[\w.-]+/i.test(l)) ?? null;
  const website = links.find((l) => !/linkedin\.com|github\.com|gitlab\.com|bitbucket\.org/i.test(l)) ?? null;
  return { linkedin, github: githubProfile, website, githubRepo };
}

const DEGREE_PHRASE =
  /\b(Bachelor(?:'s)?(?: of [A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){0,2})?|Master(?:'s)?(?: of [A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){0,2})?|Doctor of Philosophy|Ph\.?\s?D\.?|B\.?\s?A\.?\s?Sc\.?|B\.?\s?Sc\.?|B\.?\s?Eng\.?|B\.?\s?Tech\.?|B\.?\s?Comm?\.?|B\.?\s?A\.?|M\.?\s?A\.?\s?Sc\.?|M\.?\s?Sc\.?|M\.?\s?Eng\.?|MBA|Advanced Diploma|Diploma|Associate(?:'s)? Degree|Certificate)\b/;

/** "Bachelor of Applied Science in Computer Engineering" → degree and major, as written. */
export function degreeAndMajor(text: string | null): { degree: string | null; major: string | null } {
  if (!text) return { degree: null, major: null };
  const m = text.match(DEGREE_PHRASE);
  if (!m) return { degree: null, major: null };
  const degree = m[1].trim();
  const after = text
    .slice((m.index ?? 0) + m[0].length)
    .replace(/^\s*(?:,|in|of|:|-|–|—|\()\s*/i, "")
    .replace(/\s*[|(].*$/, "")
    .replace(/[,;]\s*(minor|specialization|option|co-?op|honou?rs|gpa|cgpa|dean).*$/i, "")
    .trim();
  const major = after && after.length <= 80 && /^[A-Z]/.test(after) ? after : null;
  return { degree, major };
}

/** Fills degree, major and graduation of education entries from what each entry says. */
function withDegrees(entries: ResumeEntry[]): ResumeEntry[] {
  return entries.map((e) => {
    const fromTitle = degreeAndMajor(e.title);
    const fromOrg = fromTitle.degree ? fromTitle : degreeAndMajor(e.organization);
    // Only a finished range or an "Expected" date says when it ends. A lone date stays the
    // end date and is flagged for review in resume-fields.ts rather than called a graduation.
    const graduation = e.graduation ?? (e.start && e.end && !/present|current|now|ongoing/i.test(e.end) ? e.end : null);
    return { ...e, degree: e.degree ?? fromOrg.degree, major: e.major ?? fromOrg.major, graduation };
  });
}

/** Heading-based parser that needs no AI. Every value it fills is copied from the text. */
export function parseResumeHeuristic(text: string): ResumeProfile {
  const { header, sections } = resumeSections(text);
  const headerText = header.join("\n");
  const headerLinks = linksIn(headerText);
  const contact = classifyLinks(headerLinks.length ? headerLinks : linksIn(text));
  const location = header.flatMap((l) => l.split(/\s+[|•·]\s+/)).find((p) => CA_LOCATION.test(p.trim())) ?? null;

  return ResumeProfile.parse({
    name: nameCandidate(header),
    email: headerText.match(new RegExp(EMAIL.source))?.[0] ?? text.match(new RegExp(EMAIL.source))?.[0] ?? null,
    phone: headerText.match(new RegExp(PHONE.source))?.[0]?.trim() ?? null,
    location: location?.trim() ?? null,
    links: headerLinks.slice(0, 6),
    contact: { linkedin: contact.linkedin, github: contact.github, website: contact.website },
    summary: sections.summary?.join(" ").trim() || null,
    experience: entriesFrom(sections.experience ?? [], "x"),
    education: withDegrees(entriesFrom(sections.education ?? [], "d")),
    projects: entriesFrom(sections.projects ?? [], "p"),
    skills: splitSkills(sections.skills ?? []),
    certifications: (sections.certifications ?? []).map((l) => l.replace(BULLET, "").trim()).filter(Boolean).slice(0, 30),
    awards: entriesFrom(sections.awards ?? [], "a").slice(0, 30),
    activities: entriesFrom(sections.activities ?? [], "v").slice(0, 30),
  });
}

// ------------------------------------------------------------------ AI parsing

const AiEntry = z.object({
  organization: z.string(),
  title: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  location: z.string().nullable(),
  bullets: z.array(z.string()),
  degree: z.string().nullable(),
  major: z.string().nullable(),
  graduation: z.string().nullable(),
});
export const AiResume = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  links: z.array(z.string()),
  summary: z.string().nullable(),
  experience: z.array(AiEntry),
  education: z.array(AiEntry),
  projects: z.array(AiEntry),
  skills: z.array(z.string()),
  certifications: z.array(z.string()),
  awards: z.array(AiEntry),
  activities: z.array(AiEntry),
});
export type AiResume = z.infer<typeof AiResume>;


/** True if the text appears in the resume, ignoring case, punctuation and line breaks. */
export function inResume(rawClean: string, text: string | null | undefined): boolean {
  const t = clean(text).trim();
  return t.length > 0 && rawClean.includes(` ${t} `);
}

/** Keeps only what the resume really says, and assigns ids. Exported for tests. */
export function groundAiResume(ai: AiResume, raw: string): ResumeProfile {
  const rawClean = clean(raw);
  const keep = (s: string | null) => (s && inResume(rawClean, s) ? s.trim() : null);
  const entries = (list: AiResume["experience"], prefix: string): ResumeEntry[] =>
    list
      .filter((e) => inResume(rawClean, e.organization))
      .map((e, i) => {
        const id = `${prefix}${i + 1}`;
        return {
          id,
          organization: e.organization.trim(),
          title: keep(e.title),
          start: keep(e.start),
          end: keep(e.end),
          location: keep(e.location),
          bullets: e.bullets.filter((b) => inResume(rawClean, b)).map((text, j) => ({ id: `${id}b${j + 1}`, text: text.trim() })),
          degree: keep(e.degree),
          major: keep(e.major),
          // "Expected 2027" may be phrased differently; the date itself must be in the text.
          graduation: e.graduation && inResume(rawClean, e.graduation.replace(/^(expected|anticipated)\s+/i, "")) ? e.graduation.trim() : null,
        };
      });
  const links = ai.links.filter((l) => raw.includes(l.replace(/^https?:\/\//, "").replace(/\/$/, ""))).slice(0, 6);
  const contact = classifyLinks(links);
  return ResumeProfile.parse({
    name: keep(ai.name),
    email: ai.email && raw.includes(ai.email) ? ai.email : null,
    phone: keep(ai.phone),
    location: keep(ai.location),
    links,
    contact: { linkedin: contact.linkedin, github: contact.github, website: contact.website },
    summary: keep(ai.summary),
    experience: entries(ai.experience, "x"),
    education: entries(ai.education, "d"),
    projects: entries(ai.projects, "p"),
    skills: [...new Set(ai.skills.filter((s) => inResume(rawClean, s)).map((s) => s.trim()))].slice(0, 120),
    certifications: ai.certifications.filter((c) => inResume(rawClean, c)).slice(0, 30),
    awards: entries(ai.awards, "a").slice(0, 30),
    activities: entries(ai.activities, "v").slice(0, 30),
  });
}

/** An AI reading of the resume, kept only where it matches the text. Falls back to the rules' reading. */
export async function parseResume(text: string, ai: AIProvider): Promise<{ profile: ResumeProfile; parsedWith: "ai" | "heuristic"; note: string | null }> {
  const heuristic = parseResumeHeuristic(text);
  const res = await ai.parseResume(text);
  if (!res.ok) return { profile: heuristic, parsedWith: "heuristic", note: `The AI read didn't work (${res.reason}), so your resume was read without it.` };
  const profile = groundAiResume(res.data, text);
  const bullets = (p: ResumeProfile) => [...p.experience, ...p.projects].reduce((n, e) => n + e.bullets.length, 0);
  // If grounding threw most of it away, the rules' reading is the safer result.
  if (bullets(profile) < bullets(heuristic) / 2) return { profile: heuristic, parsedWith: "heuristic", note: "The AI read didn't match the text closely, so your resume was read without it." };
  return { profile, parsedWith: "ai", note: null };
}

// ------------------------------------------------------------------ derived facts

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Month index (years × 12 + month) of a resume date, or null. "Present" is `now`. */
export function monthOf(value: string | null, now = new Date()): number | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (/^(present|current|now|ongoing)$/.test(v)) return now.getFullYear() * 12 + now.getMonth();
  const mmYYYY = v.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYYYY) return Number(mmYYYY[2]) * 12 + Math.min(11, Math.max(0, Number(mmYYYY[1]) - 1));
  const named = v.match(/^([a-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (named && MONTHS.includes(named[1])) return Number(named[2]) * 12 + MONTHS.indexOf(named[1]);
  const year = v.match(/(\d{4})/);
  return year ? Number(year[1]) * 12 : null;
}

/** Years of work experience from the experience dates, with overlapping roles counted once. */
export function yearsOfExperience(profile: ResumeProfile, now = new Date()): number {
  const spans = profile.experience
    .map((e) => {
      const start = monthOf(e.start, now);
      const end = monthOf(e.end, now) ?? start;
      return start !== null && end !== null && end >= start ? ([start, end + 1] as const) : null;
    })
    .filter((s): s is readonly [number, number] => s !== null)
    .sort((a, b) => a[0] - b[0]);
  let months = 0;
  let reach = -Infinity;
  for (const [s, e] of spans) {
    if (e <= reach) continue;
    months += e - Math.max(s, reach);
    reach = e;
  }
  return Math.round((months / 12) * 10) / 10;
}

const LEVEL_PATTERNS: [DegreeLevel, RegExp][] = [
  ["phd", /\b(ph\s?d|doctor(ate)? of|doctoral)\b/],
  ["master", /\b(master|masters|m\s?sc|m\s?eng|m\s?a\s?sc|mba|m\s?s|m\s?a)\b/],
  ["bachelor", /\b(bachelor|bachelors|b\s?sc|b\s?eng|b\s?a\s?sc|b\s?tech|b\s?comm?|b\s?s|b\s?a|undergraduate degree|honours degree)\b/],
  ["diploma", /\b(diploma|associate|certificate|college program|advanced diploma)\b/],
];

/** The highest degree level the resume shows, or null if none is recognisable. */
export function highestDegree(profile: ResumeProfile): DegreeLevel | null {
  let best = -1;
  for (const e of profile.education) {
    const t = clean(`${e.title ?? ""} ${e.organization}`);
    for (const [level, re] of LEVEL_PATTERNS) {
      if (re.test(t)) best = Math.max(best, DEGREE_LEVELS.indexOf(level));
    }
  }
  return best >= 0 ? DEGREE_LEVELS[best] : null;
}

/** Everything the resume says, for checking quotes and tailored text against it. */
export function resumeText(profile: ResumeProfile, raw: string): string {
  const parts = [raw, profile.summary, ...profile.skills, ...profile.certifications];
  for (const e of [...profile.experience, ...profile.education, ...profile.projects]) parts.push(e.organization, e.title, ...e.bullets.map((b) => b.text));
  return parts.filter(Boolean).join("\n");
}
