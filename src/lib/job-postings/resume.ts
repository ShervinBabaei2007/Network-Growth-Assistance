import { z } from "zod";
import type { LLMProvider } from "@/lib/discovery/llm";
import { clean } from "@/lib/text/match";
import { DEGREE_LEVELS, type DegreeLevel, type ResumeEntry, type ResumeProfile } from "./types";

/**
 * Turns resume text into a ResumeProfile. With AI, Claude structures it; every
 * organization, bullet and skill it returns must appear in the text, or it is dropped.
 * Without AI (or if the model fails), a heading-based parser does a coarser job.
 */

export const MAX_RESUME_TEXT = 60_000;

const HEADINGS: [keyof Pick<ResumeProfile, "experience" | "education" | "projects" | "skills" | "certifications" | "summary">, RegExp][] = [
  ["experience", /^(work |professional |relevant |employment |industry |co op |coop )?(experience|employment|history|work history)( history)?$/],
  ["education", /^(education|academic background|education and training)$/],
  ["projects", /^(technical |personal |academic |selected |relevant )?projects?( experience)?$/],
  ["skills", /^(technical |core |key )?(skills|technologies|competencies|skills and (tools|technologies|interests)|tools and technologies)$/],
  ["certifications", /^(certifications?|licen[cs]es?( and certifications?)?|certifications? and licen[cs]es?|certificates)$/],
  ["summary", /^(summary|profile|professional summary|objective|career objective|about me)$/],
];

const BULLET = /^[•\-*▪●◦–·‣⁃■□➢►✓]\s*/;
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4})`;
const DATE_RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|present|current|now|ongoing)`, "i");
const SINGLE_DATE = new RegExp(`(?:expected\\s+)?(${MONTH}\\s+\\d{4}|\\d{4})\\s*$`, "i");
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const LINK = /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/[\w-]+|github\.com\/[\w-]+|[\w-]+\.(?:dev|io|me|ca|com)\/?[\w/-]*)/gi;

function headingOf(line: string): (typeof HEADINGS)[number][0] | null {
  if (line.length > 45) return null;
  const t = clean(line).trim();
  for (const [key, re] of HEADINGS) if (re.test(t)) return key;
  return null;
}

/** Splits "Acme Corp — Software Developer Intern   May 2023 – Aug 2023" into its parts. */
function splitHeader(line: string): { text: string; start: string | null; end: string | null } {
  const m = line.match(DATE_RANGE);
  if (m) {
    const text = line.replace(m[0], "").replace(/[|,–—-]\s*$/, "").replace(/\s{2,}/g, " ").trim();
    return { text, start: m[1], end: m[2] };
  }
  const single = line.match(SINGLE_DATE);
  if (single && line.length > single[0].length + 3) return { text: line.slice(0, single.index).replace(/[|,–—-]\s*$/, "").trim(), start: null, end: single[1] };
  return { text: line, start: null, end: null };
}

/** Header lines like "Software Developer, Acme Corp" or "Acme Corp | Vancouver, BC". */
function headerParts(lines: string[]): Pick<ResumeEntry, "organization" | "title" | "location"> {
  const parts = lines.flatMap((l) => l.split(/\s+[|•·]\s+|\s{3,}|\s+[–—]\s+/)).map((s) => s.trim()).filter(Boolean);
  const loc = parts.find((p) => /,\s*(BC|ON|AB|QC|MB|SK|NS|NB|NL|PE|Canada|[A-Z]{2})$/.test(p) || /^remote$/i.test(p)) ?? null;
  const rest = parts.filter((p) => p !== loc);
  return { organization: rest[0] ?? lines[0] ?? "", title: rest[1] ?? null, location: loc };
}

function entriesFrom(lines: string[], prefix: string): ResumeEntry[] {
  const entries: ResumeEntry[] = [];
  let header: string[] = [];
  let current: ResumeEntry | null = null;
  let dates: { start: string | null; end: string | null } = { start: null, end: null };

  const flushHeader = () => {
    if (!header.length) return;
    const id = `${prefix}${entries.length + 1}`;
    current = { id, ...headerParts(header), start: dates.start, end: dates.end, bullets: [] };
    entries.push(current);
    header = [];
    dates = { start: null, end: null };
  };

  for (const raw of lines) {
    const isBullet = BULLET.test(raw);
    if (isBullet) {
      flushHeader();
      if (!current) {
        current = { id: `${prefix}${entries.length + 1}`, organization: "", title: null, start: null, end: null, location: null, bullets: [] };
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
    const { text, start, end } = splitHeader(raw);
    if (start || end) dates = { start: dates.start ?? start, end: dates.end ?? end };
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

/** Heading-based parser for when AI is off or fails. Coarse, but every word is from the text. */
export function parseResumeHeuristic(text: string): ResumeProfile {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const sections: Partial<Record<(typeof HEADINGS)[number][0], string[]>> = {};
  const header: string[] = [];
  let section: (typeof HEADINGS)[number][0] | null = null;
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

  const headerText = header.join("\n");
  const firstLine = header[0] ?? "";
  const name = firstLine && firstLine.length <= 60 && !EMAIL.test(firstLine) && !/\d/.test(firstLine) ? firstLine.split(/\s+[|•·]\s+/)[0] : null;
  const links = [...new Set([...headerText.matchAll(LINK)].map((m) => m[0]).filter((l) => !EMAIL.test(l) && !/@/.test(l)))].slice(0, 6);
  const location = header.flatMap((l) => l.split(/\s+[|•·]\s+/)).find((p) => /^[A-Z][\w .'-]+,\s*(BC|ON|AB|QC|MB|SK|NS|NB|NL|PE|British Columbia|Ontario|Canada)$/.test(p.trim())) ?? null;

  return {
    name,
    email: headerText.match(EMAIL)?.[0] ?? null,
    phone: headerText.match(PHONE)?.[0] ?? null,
    location: location?.trim() ?? null,
    links,
    summary: sections.summary?.join(" ").trim() || null,
    experience: entriesFrom(sections.experience ?? [], "x"),
    education: entriesFrom(sections.education ?? [], "d"),
    projects: entriesFrom(sections.projects ?? [], "p"),
    skills: splitSkills(sections.skills ?? []),
    certifications: (sections.certifications ?? []).map((l) => l.replace(BULLET, "").trim()).filter(Boolean).slice(0, 30),
  };
}

// ------------------------------------------------------------------ AI parsing

const AiEntry = z.object({
  organization: z.string(),
  title: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  location: z.string().nullable(),
  bullets: z.array(z.string()),
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
});
export type AiResume = z.infer<typeof AiResume>;

const PARSE_SYSTEM = `You convert resume text into structured data. Copy text exactly as written: do not reword, fix, summarize, merge or invent anything.
- experience: paid roles, co-ops and internships. organization = employer, title = job title.
- education: organization = school, title = degree and program (e.g. "Diploma, Computer Systems Technology").
- projects: organization = project name, title = role or tech line if present.
- bullets: each bullet or sentence under an entry, verbatim.
- skills: individual skills, tools, languages, frameworks, as listed.
- certifications: certifications and licences, verbatim.
Use null for anything not in the text.`;

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
        };
      });
  return {
    name: keep(ai.name),
    email: ai.email && raw.includes(ai.email) ? ai.email : null,
    phone: keep(ai.phone),
    location: keep(ai.location),
    links: ai.links.filter((l) => raw.includes(l.replace(/^https?:\/\//, "").replace(/\/$/, ""))).slice(0, 6),
    summary: keep(ai.summary),
    experience: entries(ai.experience, "x"),
    education: entries(ai.education, "d"),
    projects: entries(ai.projects, "p"),
    skills: [...new Set(ai.skills.filter((s) => inResume(rawClean, s)).map((s) => s.trim()))].slice(0, 120),
    certifications: ai.certifications.filter((c) => inResume(rawClean, c)).slice(0, 30),
  };
}

export async function parseResume(text: string, llm: LLMProvider): Promise<{ profile: ResumeProfile; parsedWith: "ai" | "heuristic"; note: string | null }> {
  const heuristic = parseResumeHeuristic(text);
  if (!llm.enabled) return { profile: heuristic, parsedWith: "heuristic", note: "Parsed without AI: check the sections below." };
  const res = await llm.structured({ tier: "fast", system: PARSE_SYSTEM, user: `Resume text:\n"""\n${text}\n"""`, schema: AiResume, maxTokens: 12_000 });
  if (!res.ok) return { profile: heuristic, parsedWith: "heuristic", note: `AI parsing failed (${res.reason}), so a simpler parser was used. Check the sections below.` };
  const profile = groundAiResume(res.data, text);
  const bullets = (p: ResumeProfile) => [...p.experience, ...p.projects].reduce((n, e) => n + e.bullets.length, 0);
  // If grounding threw most of it away, the simple parser is the safer result.
  if (bullets(profile) < bullets(heuristic) / 2) return { profile: heuristic, parsedWith: "heuristic", note: "AI parsing didn't match the text closely, so a simpler parser was used. Check the sections below." };
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
