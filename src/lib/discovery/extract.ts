import { z } from "zod";
import { normalizeProfileUrl } from "@/lib/linkedin/normalize-url";
import { clean } from "@/lib/text/match";
import { nameTokens, normalizeName } from "@/lib/text/names";
import { isFetchable, isLinkedInUrl } from "./blocklist";
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
import { countryName } from "./location";
import { mentionsName, quoteForm, sourceConfidence, type Fact, type FactField } from "./evidence";
import type { LLMProvider } from "./llm";
import type { GitHubProfile, OrcidAffiliation, OrcidProfile } from "./providers/types";

/** A person found on one source, with only the facts that source proves. */
export type PersonDraft = {
  fullName: string;
  headline: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  location: string | null;
  githubUrl: string | null;
  githubLogin: string | null;
  personalWebsite: string | null;
  linkedinUrl: string | null;
  linkedinKey: string | null;
  facts: Fact[];
  sourceUrl: string;
  sourceTitle: string | null;
  /** Set when the source is a structured public profile (no fetched page): stored as the evidence source. */
  profile?: { provider: "github" | "orcid"; excerpt: string | null; identityKey: string };
};

export type PageInput = { url: string; title: string; text: string; links: string[] };

// ------------------------------------------------------------ pre-filtering

/** Cheap deterministic gate: only pages that mention the school reach the model. */
export function pageWorthExtracting(page: Pick<PageInput, "title" | "text">, criteria: NetworkingCriteria): boolean {
  const inst = institutionMatcher(criteria);
  if (!inst) return true;
  return matchInstitution(`${page.title}\n${page.text}`, inst) !== null;
}

/**
 * The parts of a long page around mentions of the school, so the model reads
 * the relevant few thousand characters instead of the whole page.
 */
export function relevantWindow(text: string, criteria: NetworkingCriteria, maxChars = 14_000): string {
  if (text.length <= maxChars) return text;
  const inst = institutionMatcher(criteria);
  const terms = inst ? [...inst.strong, ...inst.acronyms] : [];
  const lower = quoteForm(text);
  const spans: [number, number][] = [];
  for (const term of terms) {
    let i = lower.indexOf(term);
    while (i !== -1 && spans.length < 40) {
      spans.push([Math.max(0, i - 1500), Math.min(text.length, i + 1500)]);
      i = lower.indexOf(term, i + term.length);
    }
  }
  if (!spans.length) return text.slice(0, maxChars);
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([...s]);
  }
  let out = "";
  for (const [a, b] of merged) {
    if (out.length >= maxChars) break;
    out += `${text.slice(a, b)}\n…\n`;
  }
  return out.slice(0, maxChars);
}

// -------------------------------------------------------------- LLM output

const EXTRACT_FIELDS = ["institution", "program", "degree", "grad_year", "role", "company", "location"] as const;

export const ExtractionSchema = z.object({
  people: z.array(
    z.object({
      fullName: z.string(),
      headline: z.string().nullable(),
      facts: z.array(z.object({ field: z.enum(EXTRACT_FIELDS), value: z.string(), quote: z.string() })),
      githubUrl: z.string().nullable(),
      websiteUrl: z.string().nullable(),
      linkedinUrl: z.string().nullable(),
    }),
  ),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

const SYSTEM = `You extract people from one public web page for a networking research tool.

List each real, named individual the page gives professional or academic details about. For each, give facts only from this page:
- institution (school attended), program (field of study), degree, grad_year, role (job title), company (employer), location.
- Every fact needs "quote": a short passage copied EXACTLY from the page text (one sentence or line) that states it. If you can't quote it, leave the fact out.
- "value" is the fact as written in the quote, e.g. value "AMD" from quote "Backend engineer at AMD".
- githubUrl, websiteUrl, linkedinUrl: only links that appear in the page's link list and clearly belong to this person; otherwise null.

Never guess. Don't infer a program from a club, a school from a city, or a current job from an old one. Skip people mentioned only in passing (authors of cited papers, people thanked, instructors) and organizations.`;

export async function extractPeopleWithLlm(llm: LLMProvider, page: PageInput, criteria: NetworkingCriteria): Promise<{ ok: true; data: Extraction } | { ok: false; reason: string }> {
  const links = page.links.filter((l) => /github\.com\/[^/]+\/?$|linkedin\.com\/in\//i.test(l) || !/github\.com|linkedin\.com/i.test(l)).slice(0, 80);
  const user = `Source URL: ${page.url}
Page title: ${page.title}

Links on the page:
${links.join("\n") || "(none)"}

Page text:
${relevantWindow(page.text, criteria)}`;
  return llm.structured({ tier: "fast", system: SYSTEM, user, schema: ExtractionSchema, maxTokens: 8000 });
}

// ------------------------------------------------------------ verification

const GITHUB_PROFILE = /^https?:\/\/(www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/?$/i;

/** Keeps a URL only if the page actually links to it (models must not invent links). */
function linkOnPage(url: string | null, page: PageInput): string | null {
  if (!url) return null;
  const want = url.replace(/\/+$/, "").toLowerCase();
  return page.links.find((l) => l.replace(/\/+$/, "").toLowerCase() === want) ?? null;
}

/**
 * Turns model output into evidence. Every fact must quote text that is really on
 * the page and the quote must contain the value; every link must be on the page;
 * the person's name must appear on the page. Anything else is dropped, never kept
 * as a guess. Confidence comes from these rules, not from the model.
 */
export function verifyExtraction(extraction: Extraction, page: PageInput, criteria: NetworkingCriteria): { people: PersonDraft[]; dropped: number } {
  const pageForm = quoteForm(page.text);
  const titleClean = clean(page.title);
  const inst = institutionMatcher(criteria);
  let dropped = 0;
  const people: PersonDraft[] = [];
  const named = extraction.people.filter((p) => normalizeName(p.fullName).includes(" "));

  for (const p of named.slice(0, 25)) {
    if (!mentionsName(page.text, p.fullName) && !mentionsName(page.title, p.fullName)) {
      dropped += 1 + p.facts.length;
      continue;
    }
    const tokens = nameTokens(p.fullName);
    const personalPage = tokens.length >= 2 && titleClean.includes(` ${tokens[0]} `) && titleClean.includes(` ${tokens[tokens.length - 1]} `);

    const facts: Fact[] = [];
    for (const f of p.facts) {
      const quote = f.quote.replace(/\s+/g, " ").trim();
      if (quote.length < 3 || quote.length > 500 || !pageForm.includes(quoteForm(quote))) {
        dropped++;
        continue;
      }
      let value = f.value.replace(/\s+/g, " ").trim().slice(0, 200);
      const q = clean(quote);
      let supported: boolean;
      if (f.field === "institution" && inst && matchInstitution(quote, inst)) {
        value = inst.name;
        supported = true;
      } else if (f.field === "grad_year") {
        // "2024" or "'24" in the quote; the value is stored as the full year.
        const year = /^(19[5-9]\d|20\d\d)$/.test(value) ? value : null;
        supported = Boolean(year && (quote.includes(year) || quote.includes(`'${year.slice(2)}`) || quote.includes(`’${year.slice(2)}`)));
      } else {
        // The program is kept as written, so ECE stays ECE and is never upgraded to CE.
        supported = Boolean(value) && q.includes(clean(value));
      }
      if (!supported) {
        dropped++;
        continue;
      }
      facts.push({
        field: f.field,
        value,
        sourceUrl: page.url,
        sourceTitle: page.title || null,
        extractedText: quote,
        confidence: sourceConfidence({ nameInQuote: mentionsName(quote, p.fullName), personalPage, peopleOnPage: named.length }),
      });
    }

    const gh = linkOnPage(p.githubUrl, page);
    const ghMatch = gh?.match(GITHUB_PROFILE);
    const site = linkOnPage(p.websiteUrl, page);
    const li = linkOnPage(p.linkedinUrl, page);
    const liNorm = li ? normalizeProfileUrl(li) : null;
    if ((p.githubUrl && !ghMatch) || (p.websiteUrl && !site) || (p.linkedinUrl && !li)) dropped++;

    const top = (field: FactField) => facts.filter((f) => f.field === field).sort((a, b) => rank(b) - rank(a))[0]?.value ?? null;
    const headline = p.headline && pageForm.includes(quoteForm(p.headline)) ? p.headline.slice(0, 200) : null;
    people.push({
      fullName: p.fullName.replace(/\s+/g, " ").trim().slice(0, 200),
      headline,
      currentTitle: top("role"),
      currentCompany: top("company"),
      location: top("location"),
      githubUrl: ghMatch ? `https://github.com/${ghMatch[2]}` : null,
      githubLogin: ghMatch ? ghMatch[2].toLowerCase() : null,
      personalWebsite: site && isFetchable(site) ? site : personalPage && isFetchable(page.url) && !/github\.com/i.test(page.url) ? page.url : null,
      linkedinUrl: liNorm?.ok ? liNorm.url : null,
      linkedinKey: liNorm?.ok ? liNorm.key : null,
      facts,
      sourceUrl: page.url,
      sourceTitle: page.title || null,
    });
  }
  return { people, dropped };
}

const rank = (f: Fact) => ({ high: 3, medium: 2, low: 1 })[f.confidence];

// ------------------------------------------------------------------ GitHub

/**
 * A GitHub profile is the person's own public statement, so its fields are high
 * confidence evidence for what they literally say. Profiles without a real name or
 * any mention of the school are skipped: we can't tell who they are or that they match.
 */
export function draftFromGitHub(profile: GitHubProfile, criteria: NetworkingCriteria): PersonDraft | null {
  const name = profile.name?.trim();
  if (!name || !normalizeName(name).includes(" ")) return null;
  const inst = institutionMatcher(criteria);
  const bio = profile.bio?.trim() ?? "";
  const companyField = profile.company?.replace(/^@/, "").trim() || null;
  const about = [bio, profile.company ?? ""].join(" · ");
  if (inst && !matchInstitution(about, inst)) return null;

  const source = { sourceUrl: profile.htmlUrl, sourceTitle: `GitHub · ${profile.login}`, confidence: "high" as const };
  const facts: Fact[] = [];
  if (inst && matchInstitution(about, inst)) facts.push({ ...source, field: "institution", value: inst.name, extractedText: about.slice(0, 500) });
  const programs = programMatchers(criteria);
  if (bio && matchProgram(bio, programs, criteria.education.broadenEce)) {
    const p = matchProgram(bio, programs, criteria.education.broadenEce)!;
    facts.push({ ...source, field: "program", value: p.kind === "ece" ? "Electrical and Computer Engineering" : p.program, extractedText: bio.slice(0, 500) });
  }
  const role = bio ? matchRole(bio, roleAliases(criteria.roles)) : null;
  if (role) facts.push({ ...source, field: "role", value: role, extractedText: bio.slice(0, 500) });
  // A school in the company field ("@UofT") is not an employer.
  const companyIsSchool = companyField && inst ? matchInstitution(companyField, inst) !== null : false;
  if (companyField && !companyIsSchool) facts.push({ ...source, field: "company", value: companyField.slice(0, 200), extractedText: `Company: ${profile.company}` });
  else if (bio) {
    const listed = matchAlias(bio, companyAliases(criteria.companies));
    // "Software engineer @ Amazon" / "SWE at Shopify": a self-reported employer.
    const at = bio.match(/(?:@|\bat)\s+([A-Z][\w&.-]*(?:\s(?:(?:of|and|&|the)\s)?[A-Z][\w&.-]*){0,3})/)?.[1];
    const value = listed ? (criteria.companies.find((x) => clean(x).includes(listed)) ?? listed) : at && !(inst && matchInstitution(at, inst)) ? at : null;
    if (value) facts.push({ ...source, field: "company", value, extractedText: bio.slice(0, 500) });
  }
  if (profile.location) facts.push({ ...source, field: "location", value: profile.location.slice(0, 200), extractedText: `Location: ${profile.location}` });

  const blog = profile.blog?.trim() ? (/^https?:\/\//i.test(profile.blog) ? profile.blog.trim() : `https://${profile.blog.trim()}`) : null;
  const li = blog && isLinkedInUrl(blog) ? normalizeProfileUrl(blog) : null;
  return {
    fullName: name.slice(0, 200),
    headline: bio ? bio.slice(0, 200) : null,
    currentTitle: role,
    currentCompany: facts.find((f) => f.field === "company")?.value ?? null,
    location: profile.location,
    githubUrl: profile.htmlUrl,
    githubLogin: profile.login.toLowerCase(),
    personalWebsite: blog && !li && isFetchable(blog) ? blog : null,
    linkedinUrl: li?.ok ? li.url : null,
    linkedinKey: li?.ok ? li.key : null,
    facts,
    sourceUrl: profile.htmlUrl,
    sourceTitle: `GitHub · ${profile.login}`,
    profile: { provider: "github", excerpt: bio || null, identityKey: `github:${profile.login.toLowerCase()}` },
  };
}

// ------------------------------------------------------------------- ORCID

const span = (a: OrcidAffiliation) => (a.startYear || a.endYear ? ` (${a.startYear ?? "?"}–${a.endYear ?? "present"})` : "");
const describe = (kind: string, a: OrcidAffiliation) => `${kind}: ${[a.organization, a.department, a.role].filter(Boolean).join(" — ")}${span(a)}`;

/** Sentences of a biography that mention something, used as quotes. */
const sentencesWith = (bio: string, test: (s: string) => boolean) =>
  bio
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim())
    .filter((x) => x && test(x))
    .map((x) => x.slice(0, 500));

/** The year of the last edit when it is more than two years ago, else null (including when it is unknown). */
export function staleRecord(lastModified: string | null | undefined, now: Date): number | null {
  const t = lastModified ? Date.parse(lastModified) : NaN;
  if (Number.isNaN(t)) return null;
  return now.getTime() - t > 2 * 365 * 86_400_000 ? new Date(t).getUTCFullYear() : null;
}

/**
 * An ORCID record is the person's own structured statement of their education and
 * employment, so each entry is high-confidence evidence for exactly what it says.
 * Working at a school is not studying there: only education entries (and the
 * person's own biography) count for the school and program.
 */
export function draftFromOrcid(profile: OrcidProfile, criteria: NetworkingCriteria, now: Date = new Date()): PersonDraft | null {
  const name = profile.name?.trim();
  if (!name || !normalizeName(name).includes(" ")) return null;
  const inst = institutionMatcher(criteria);
  const programs = programMatchers(criteria);
  const source = { sourceUrl: profile.htmlUrl, sourceTitle: `ORCID · ${name}`, confidence: "high" as const };
  const facts: Fact[] = [];

  const schooling = inst ? profile.educations.filter((e) => matchInstitution(e.organization, inst)) : profile.educations;
  for (const e of schooling) {
    const text = describe("Education", e);
    if (inst) facts.push({ ...source, field: "institution", value: inst.name, extractedText: text });
    const program = matchProgram(`${e.department ?? ""} . ${e.role ?? ""}`, programs, criteria.education.broadenEce);
    if (program) facts.push({ ...source, field: "program", value: program.kind === "ece" ? "Electrical and Computer Engineering" : program.program, extractedText: text });
    else if (e.department || e.role) facts.push({ ...source, field: "degree", value: [e.role, e.department].filter(Boolean).join(", ").slice(0, 200), extractedText: text });
    // A future end year is an expected graduation: it tells current students from alumni.
    if (e.endYear) facts.push({ ...source, field: "grad_year", value: String(e.endYear), extractedText: text });
  }
  const bio = profile.biography ?? "";
  if (inst && !schooling.length && bio) {
    for (const q of sentencesWith(bio, (x) => matchInstitution(x, inst) !== null).slice(0, 1)) facts.push({ ...source, field: "institution", value: inst.name, extractedText: q });
  }
  if (bio && !facts.some((f) => f.field === "program")) {
    for (const q of sentencesWith(bio, (x) => matchProgram(x, programs, criteria.education.broadenEce) !== null).slice(0, 1)) {
      const m = matchProgram(q, programs, criteria.education.broadenEce)!;
      facts.push({ ...source, field: "program", value: m.kind === "ece" ? "Electrical and Computer Engineering" : m.program, extractedText: q });
    }
  }
  if (inst && !facts.some((f) => f.field === "institution")) return null;

  // The current job: an employment with no end date (or one ending this year or later), most recent first.
  const current = [...profile.employments].filter((e) => !e.endYear || e.endYear >= now.getFullYear()).sort((a, b) => (b.startYear ?? 0) - (a.startYear ?? 0))[0] ?? null;
  if (current) {
    const place = [current.city, countryName(current.country)].filter(Boolean).join(", ");
    // A job with no end date on a record nobody has edited for years may have ended: it counts, but only at medium
    // low confidence, so the person is "possible" unless another source says the same.
    const stale = staleRecord(profile.lastModified, now);
    const text = `${describe("Employment", current)}${place ? ` · ${place}` : ""}${stale ? ` · record last updated ${stale}` : ""}`;
    const employment = stale ? { ...source, confidence: "low" as const } : source;
    facts.push({ ...employment, field: "company", value: current.organization.slice(0, 200), extractedText: text });
    if (current.role) facts.push({ ...employment, field: "role", value: current.role.slice(0, 200), extractedText: text });
    // Where their current employer is: good, not certain, evidence of where they are.
    if (place) facts.push({ ...source, field: "location", value: place.slice(0, 200), extractedText: text, confidence: "medium" });
  } else if (bio) {
    const role = sentencesWith(bio, (x) => matchRole(x, roleAliases(criteria.roles)) !== null)[0];
    if (role) facts.push({ ...source, field: "role", value: matchRole(role, roleAliases(criteria.roles))!, extractedText: role });
  }

  // The country they list on their own record.
  for (const code of [...new Set(profile.countries)].slice(0, 2)) {
    const name = countryName(code);
    if (name) facts.push({ ...source, field: "location", value: name, extractedText: `Country: ${name}` });
  }

  const linkedin = profile.urls.map((u) => (isLinkedInUrl(u) ? normalizeProfileUrl(u) : null)).find((u) => u?.ok);
  const github = profile.urls.map((u) => u.match(/^https?:\/\/(www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/?$/i)).find(Boolean);
  const site = profile.urls.find((u) => !isLinkedInUrl(u) && !/github\.com|orcid\.org/i.test(u) && isFetchable(u)) ?? null;
  return {
    fullName: name.slice(0, 200),
    headline: bio ? bio.slice(0, 200) : null,
    currentTitle: facts.find((f) => f.field === "role")?.value ?? null,
    currentCompany: facts.find((f) => f.field === "company")?.value ?? null,
    location: facts.find((f) => f.field === "location")?.value ?? null,
    githubUrl: github ? `https://github.com/${github[2]}` : null,
    githubLogin: github ? github[2].toLowerCase() : null,
    personalWebsite: site,
    linkedinUrl: linkedin?.ok ? linkedin.url : null,
    linkedinKey: linkedin?.ok ? linkedin.key : null,
    facts,
    sourceUrl: profile.htmlUrl,
    sourceTitle: source.sourceTitle,
    profile: { provider: "orcid", excerpt: [bio, ...profile.educations.map((e) => describe("Education", e)), ...profile.employments.map((e) => describe("Employment", e))].filter(Boolean).join("\n").slice(0, 4000), identityKey: `orcid:${profile.orcidId}` },
  };
}

/** Strong identity signals for entity resolution. */
export function identityKeys(d: Pick<PersonDraft, "githubLogin" | "personalWebsite" | "linkedinKey" | "profile">): string[] {
  const keys: string[] = [];
  if (d.profile?.provider === "orcid") keys.push(d.profile.identityKey);
  if (d.githubLogin) keys.push(`github:${d.githubLogin}`);
  if (d.linkedinKey) keys.push(`linkedin:${d.linkedinKey}`);
  if (d.personalWebsite) {
    try {
      const host = new URL(d.personalWebsite).hostname.replace(/^www\./, "").toLowerCase();
      // Shared hosts (github.io pages are per-user, so they count; generic hosts don't).
      if (!/^(medium\.com|substack\.com|wordpress\.com|blogspot\.com|wix\.com|sites\.google\.com|linktr\.ee|notion\.site)$/.test(host)) keys.push(`domain:${host}`);
    } catch {
      // ignore
    }
  }
  return keys;
}
