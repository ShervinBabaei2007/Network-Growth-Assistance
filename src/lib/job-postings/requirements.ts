import { skillsIn } from "./taxonomy";
import { DEGREE_LEVELS, type DegreeLevel, type Requirement } from "./types";

/**
 * Reads a posting's requirements without AI. Every line under a requirements-type
 * heading ("Requirements", "What you'll need", "Nice to have") becomes a requirement,
 * categorized by pattern. Postings without such headings fall back to scanning the
 * whole text for years, degrees, licences and known skills. Computed once per job.
 */

export const MAX_REQUIREMENTS = 25;

export const YEARS_RE = /(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*(?:\d{1,2}\s*)?\+?\s*(?:years|yrs)\b/i;
const YEARS_ALL_RE = new RegExp(YEARS_RE.source, "gi");
const DEGREE_RE: [DegreeLevel, RegExp][] = [
  ["phd", /\b(ph\.?d|doctorate)\b/i],
  ["master", /\b(master'?s|m\.?sc|m\.?eng|mba)\b/i],
  ["bachelor", /\b(bachelor'?s|b\.?sc|b\.?eng|b\.?a\.?sc|undergraduate degree|university degree|degree in)\b/i],
  ["diploma", /\b(diploma|college program|technologist program)\b/i],
];
export const LICENCE_RE = /\b(P\.?\s?Eng|EIT|CPA|PMP|CISSP|CCNA|AWS Certified[\w -]*|Red Seal|CET|AScT|CompTIA[\w+ -]*)\b/;
const CLEARANCE_RE = /\b(security clearance|secret clearance|reliability status|enhanced reliability|top secret)\b/i;
/** Work authorization, in any country: "legally eligible to work in Canada", "authorized to work in the US", "right to work in the UK". */
const AUTH_RE =
  /\b((canadian|us|u\.s\.|american|british|australian|eu) citizen(ship)?|permanent resident|green card|(legally )?(eligible|entitled|authori[sz]ed|permitted) to work in( the)? [a-z][\w.]*|right to work in( the)? [a-z]+|work (authori[sz]ation|permit) (is )?required|no (visa )?sponsorship|not able to sponsor|unable to sponsor|without (visa )?sponsorship)\b/i;
export const LANGUAGE_RE = /\b(french|bilingual|fran[çc]ais|mandarin|cantonese|punjabi|spanish|hindi|tagalog|korean|japanese|german|portuguese|arabic)\b/i;
const LOCATION_RE = /\b(on-?site|in[- ]office|in the office|relocat\w*|located in|based in|commut\w*|days a week in)\b/i;
const PREFERRED_RE = /\b(preferred|nice to have|nice-to-have|asset|bonus|plus|desired|ideally)\b/i;
const MUST_HEADING_RE =
  /\b(requirements?|qualifications?|must[- ]haves?|you have|you'll have|you will have|you bring|you'll bring|what you need|you'll need|you will need|looking for|who you are|about you|minimum|skills)\b/i;
const OTHER_HEADING_RE =
  /^about\b|\b(responsibilities|what you.ll do|what you will do|day to day|the role|about (us|the|our)|who we are|our (team|company|mission)|benefits|perks|why (join|you.ll love)|compensation|salary|pay range|how to apply|equal opportunity|accommodation|what we offer)\b/i;
const BULLET = /^[•\-*▪●◦–·‣⁃■□➢►✓]\s*/;
/** Lead-ins and filler inside requirement sections: not requirements themselves. */
const NOT_A_REQUIREMENT =
  /^(about\b|we\b|we're\b|we are\b|our\b|the (ideal|successful|right)\b|in this role\b|this (role|position)\b|you will\b|you'll be\b|join\b|apply\b)|\b(primarily responsible|responsible for (designing|building|leading|managing)|(one|any) (or more )?of the following|the following (areas|skills|qualifications|requirements)|check off|all of these|equal opportunity|accommodat)/i;
const MAX_REQUIREMENT_CHARS = 280;

export function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf("\n", index), text.lastIndexOf(". ", index)) + 1;
  const ends = [text.indexOf("\n", index), text.indexOf(". ", index)].filter((n) => n >= 0);
  const end = ends.length ? Math.min(...ends) : text.length;
  return text.slice(start, end).replace(BULLET, "").trim().slice(0, 300);
}

/** "nice" if the sentence says so, or if it sits under a "Nice to have" / "Assets" heading. */
export function kindAt(text: string, index: number): "must" | "nice" {
  if (PREFERRED_RE.test(sentenceAround(text, index))) return "nice";
  const before = text.slice(0, index).split("\n").reverse().slice(1);
  for (const line of before) {
    const l = line.trim();
    if (!l || l.length > 60 || BULLET.test(l) || /\.\s/.test(l)) continue;
    if (PREFERRED_RE.test(l)) return "nice";
    if (MUST_HEADING_RE.test(l)) return "must";
  }
  return "must";
}

/** The lowest level a degree sentence accepts: "Diploma or degree in CS" asks for a diploma. */
export function lowestDegreeIn(sentence: string): DegreeLevel | null {
  const levels = DEGREE_RE.filter(([, re]) => re.test(sentence)).map(([level]) => level);
  return levels.sort((a, b) => DEGREE_LEVELS.indexOf(a) - DEGREE_LEVELS.indexOf(b))[0] ?? null;
}

/** What one requirement line is about. */
export function categorize(line: string): Omit<Requirement, "id" | "text" | "kind"> {
  const years = line.match(YEARS_RE);
  if (years && Number(years[1]) > 0 && Number(years[1]) <= 20 && /experience|years/i.test(line)) return { category: "years", years: Number(years[1]), degreeLevel: null };
  if (DEGREE_RE.some(([, re]) => re.test(line))) return { category: "degree", years: null, degreeLevel: lowestDegreeIn(line) };
  if (LICENCE_RE.test(line)) return { category: "licence", years: null, degreeLevel: null };
  if (CLEARANCE_RE.test(line)) return { category: "clearance", years: null, degreeLevel: null };
  if (AUTH_RE.test(line)) return { category: "authorization", years: null, degreeLevel: null };
  if (LANGUAGE_RE.test(line)) return { category: "language", years: null, degreeLevel: null };
  if (skillsIn(line).length) return { category: "skill", years: null, degreeLevel: null };
  if (LOCATION_RE.test(line)) return { category: "location", years: null, degreeLevel: null };
  return { category: "other", years: null, degreeLevel: null };
}

function isHeading(line: string): boolean {
  const words = line.split(/\s+/).length;
  return line.length <= 70 && words <= 9 && !BULLET.test(line) && !/[.;,]$/.test(line);
}

/** Requirements from the lines under requirement headings. Empty if the posting has none. */
function fromSections(description: string): Omit<Requirement, "id">[] {
  const out: Omit<Requirement, "id">[] = [];
  let section: "must" | "nice" | "other" | null = null;
  for (const raw of description.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) {
      const heading = line.replace(/:$/, "");
      // Inside a requirements list, a short line is a new heading only if it looks like one.
      const inList = section === "must" || section === "nice";
      const looksLikeHeading = !inList || line.endsWith(":") || PREFERRED_RE.test(heading) || MUST_HEADING_RE.test(heading) || OTHER_HEADING_RE.test(heading);
      if (looksLikeHeading) {
        section = PREFERRED_RE.test(heading) ? "nice" : MUST_HEADING_RE.test(heading) ? "must" : "other";
        continue;
      }
    }
    if (section !== "must" && section !== "nice") continue;
    const text = line.replace(BULLET, "").trim();
    // Lead-ins ("…one of the following:"), filler and long paragraphs aren't requirements.
    if (text.length < 2 || text.length > MAX_REQUIREMENT_CHARS || text.endsWith(":") || NOT_A_REQUIREMENT.test(text) || out.some((r) => r.text === text)) continue;
    out.push({ text, kind: section === "nice" || PREFERRED_RE.test(text) ? "nice" : "must", ...categorize(text) });
    if (out.length >= MAX_REQUIREMENTS) break;
  }
  return out;
}

/** Scans the whole text when the posting has no requirement headings. */
export function extractRequirementsKeywords(description: string): Requirement[] {
  const out: Omit<Requirement, "id">[] = [];
  const kind = (i: number) => kindAt(description, i);
  const years = [...description.matchAll(YEARS_ALL_RE)].map((m) => ({ n: Number(m[1]), i: m.index! })).filter((y) => y.n > 0 && y.n <= 20);
  if (years.length) {
    const top = years.reduce((a, b) => (b.n > a.n && kind(b.i) === "must" ? b : a));
    out.push({ text: sentenceAround(description, top.i), kind: kind(top.i), category: "years", years: top.n, degreeLevel: null });
  }
  const degreeAt = DEGREE_RE.map(([, re]) => re.exec(description)?.index).filter((i): i is number => i !== undefined).sort((x, y) => x - y)[0];
  if (degreeAt !== undefined) {
    const sentence = sentenceAround(description, degreeAt);
    out.push({ text: sentence, kind: kind(degreeAt), category: "degree", years: null, degreeLevel: lowestDegreeIn(sentence) });
  }
  for (const [re, category] of [
    [LICENCE_RE, "licence"],
    [CLEARANCE_RE, "clearance"],
    [AUTH_RE, "authorization"],
  ] as const) {
    const m = re.exec(description);
    if (m) out.push({ text: sentenceAround(description, m.index), kind: category === "authorization" ? "must" : kind(m.index), category, years: null, degreeLevel: null });
  }
  for (const skill of skillsIn(description)) {
    if (out.length >= MAX_REQUIREMENTS) break;
    const i = description.toLowerCase().indexOf(skill.name.toLowerCase());
    out.push({ text: skill.name, kind: i >= 0 ? kind(i) : "must", category: "skill", years: null, degreeLevel: null });
  }
  return out.map((r, i) => ({ ...r, id: `r${i + 1}` }));
}

export function extractRequirements(description: string): Requirement[] {
  const sections = fromSections(description);
  if (sections.length >= 2) return sections.map((r, i) => ({ ...r, id: `r${i + 1}` }));
  return extractRequirementsKeywords(description);
}
