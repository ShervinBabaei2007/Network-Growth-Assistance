import { normalizeProfileUrl } from "@/lib/linkedin/normalize-url";
import { clean } from "@/lib/text/match";
import {
  companyAliases,
  institutionMatcher,
  matchAlias,
  matchInstitution,
  matchProgram,
  matchRole,
  programMatchers,
  roleAliases,
  type NetworkingCriteria,
} from "./criteria";
import { mentionsName, type Fact } from "./evidence";
import { classifyCountry } from "./location";

/**
 * Verification without AI: reads a person's own pages (their GitHub profile README,
 * the website they link from their profile) line by line, and keeps a fact only
 * when a line states it. Each fact quotes that line. On someone else's page, only
 * lines that name the person count.
 */

const ROLE_FALLBACK = ["software engineer"];

/** Lines and sentences short enough to quote. */
export function quotableLines(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 4 && l.length <= 300)
    .slice(0, 600);
}

/** "2024", "’24" / "'24" or UofT's "2T4" next to the school or program → 2024. */
export function gradYearIn(line: string): number | null {
  const full = [...line.matchAll(/\b(19[5-9]\d|20\d\d)\b/g)].map((m) => Number(m[1]));
  if (full.length) return full[full.length - 1];
  const tee = line.match(/\b(\d)T(\d)\b/);
  if (tee) return 2000 + Number(tee[1]) * 10 + Number(tee[2]);
  const short = line.match(/['’](\d\d)\b/);
  if (short) return 2000 + Number(short[1]);
  return null;
}

/** The employer after "at" / "@" in a line about work, e.g. "Software Engineer at Shopify". */
function employerIn(line: string): string | null {
  // Capitalized words, allowing "of" / "and" / "&" inside names like "University of Toronto".
  const m = line.match(/(?:\bat|@)\s+([A-Z][\w&.-]*(?:\s(?:(?:of|and|&|the)\s)?[A-Z][\w&.-]*){0,3})/);
  return m ? m[1].replace(/[.,;:]$/, "") : null;
}

/** The role phrase as written in the line (keeps the person's own capitalization). */
function roleAsWritten(line: string, alias: string): string {
  const i = clean(line).indexOf(` ${alias} `);
  if (i < 0) return alias;
  // Map back by searching case-insensitively for the alias words in the original line.
  const re = new RegExp(alias.split(" ").map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s-]+"), "i");
  return line.match(re)?.[0] ?? alias;
}

export function factsFromOwnPage(
  page: { url: string; title: string; text: string },
  person: { fullName: string },
  criteria: NetworkingCriteria,
  opts: { personal: boolean },
): Fact[] {
  const inst = institutionMatcher(criteria);
  const programs = programMatchers(criteria);
  const roles = roleAliases(criteria.roles.length ? criteria.roles : ROLE_FALLBACK);
  const companies = companyAliases(criteria.companies);
  const facts: Fact[] = [];
  const seen = new Set<string>();
  const add = (field: Fact["field"], value: string, line: string) => {
    const key = `${field}|${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ field, value: value.slice(0, 200), sourceUrl: page.url, sourceTitle: page.title || null, extractedText: line, confidence: "high" });
  };

  for (const line of quotableLines(page.text)) {
    if (!opts.personal && !mentionsName(line, person.fullName)) continue;
    const school = inst ? matchInstitution(line, inst) : null;
    const program = matchProgram(line, programs, criteria.education.broadenEce);
    if (school && inst) add("institution", inst.name, line);
    if (program) add("program", program.kind === "ece" ? "Electrical and Computer Engineering" : program.program, line);
    if (school || program) {
      const y = gradYearIn(line);
      if (y && y >= 1950 && y <= new Date().getFullYear() + 6) add("grad_year", String(y), line);
    }
    // "Based in Toronto", "📍 Vancouver, BC", "Location: Waterloo, ON": kept only if the place is recognizable.
    const place = line.match(/(?:\bbased in|\blocated in|\bliving in|\bI live in|📍|\blocation\s*:)\s*(?:(?:based|located|living) in\s+)?([^|•·;()\n]{2,60})/i)?.[1];
    if (place) {
      const value = place.replace(/\s+(?:and|where|working|with)\b.*$/i, "").replace(/[.,!\s]+$/, "").trim();
      if (classifyCountry(value)) add("location", value, line);
    }
    const role = matchRole(line, roles);
    if (role) {
      add("role", roleAsWritten(line, role), line);
      const listed = matchAlias(line, companies);
      const employer = listed ? (criteria.companies.find((c) => clean(c).includes(listed)) ?? listed) : employerIn(line);
      if (employer && !(inst && matchInstitution(employer, inst))) add("company", employer, line);
    }
  }
  return facts;
}

/**
 * The person's own LinkedIn profile link, if their page links exactly one. A page
 * linking several LinkedIn profiles (a team page) is ambiguous, so none is taken.
 */
export function ownLinkedIn(links: string[]): { url: string; key: string } | null {
  const found = new Map<string, string>();
  for (const l of links) {
    const n = normalizeProfileUrl(l);
    if (n.ok) found.set(n.key, n.url);
  }
  if (found.size !== 1) return null;
  const [[key, url]] = [...found.entries()];
  return { key, url };
}

/** Links written in Markdown or as bare URLs in README text. */
export function linksInMarkdown(md: string): string[] {
  return [...new Set([...md.matchAll(/https?:\/\/[^\s)"'<>\]]+/g)].map((m) => m[0].replace(/[.,;]+$/, "")))];
}

/** README Markdown/HTML to plain lines: drops images, badges, code and tags; keeps link text. */
export function markdownToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`>|]/g, " ")
    .replace(/:[a-z_]+:/g, " ")
    .replace(/[ \t]+/g, " ");
}
