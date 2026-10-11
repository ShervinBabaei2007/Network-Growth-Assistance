import { institutionMatcher, programMatchers, type NetworkingCriteria } from "./criteria";
import { countrySearchTerms } from "./location";

/**
 * Turns criteria into many small, targeted searches instead of one huge one.
 * Deterministic, so the same request always plans the same searches, and every
 * web query excludes linkedin.com: LinkedIn is never a research source.
 */

export type QueryFamily =
  | "core"
  | "alias"
  | "company"
  | "location"
  | "alumni"
  | "university_site"
  | "github"
  | "portfolio"
  | "design_team"
  | "research_lab"
  | "orcid";

export type PlannedQuery = { provider: "web" | "github" | "orcid"; query: string; family: QueryFamily };

export const LINKEDIN_EXCLUSION = "-site:linkedin.com";

const q = (s: string) => `"${s.replace(/"/g, "")}"`;

/** Lowercase and collapse spaces, so trivially different spellings aren't searched twice. */
export const normalizeQuery = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function planQueries(criteria: NetworkingCriteria, max = 40): PlannedQuery[] {
  const inst = institutionMatcher(criteria);
  const programs = programMatchers(criteria).map((p) => p.canonical);
  const roles = criteria.roles.length ? criteria.roles.slice(0, 3) : [];
  const role0 = roles[0] ?? "engineer";
  const instName = inst?.name ?? null;
  // A short form people actually write in bios ("UofT"), if we have one.
  const shortName = criteria.education.institutionAliases.find((a) => a.length <= 8) ?? null;
  const progs = programs.length ? programs : [null];

  const out: PlannedQuery[] = [];
  const web = (family: QueryFamily, ...parts: (string | null | false)[]) =>
    out.push({ provider: "web", family, query: `${parts.filter(Boolean).join(" ")} ${LINKEDIN_EXCLUSION}` });

  for (const p of progs) {
    const prog = p ? q(p) : null;
    for (const r of roles.length ? roles : [null]) web("core", instName && q(instName), prog, r && q(r));
    if (shortName) web("alias", q(shortName), prog, role0);
    for (const c of criteria.companies.slice(0, 6)) web("company", instName && q(instName), prog, q(c));
    if (criteria.includeStartups) web("company", instName && q(instName), prog, "startup founder OR \"founding engineer\"");
    for (const l of criteria.locations.slice(0, 3)) web("location", instName && q(instName), prog, role0, q(l));
    web("alumni", instName && q(instName), prog, "alumni", role0);
    if (inst?.domains.length) web("university_site", `site:${inst.domains[0]}`, prog, "alumni");
    web("portfolio", instName && q(instName), prog, "portfolio", q(role0));
    web("github", "site:github.com", instName && q(instName), prog);
    web("design_team", instName && q(instName), prog, "design team", "software lead");
    web("research_lab", instName && q(instName), prog, "research lab", "members");
  }

  // GitHub's own user search: free text matches names and bios; location narrows it.
  if (instName) {
    const school = shortName ?? instName;
    const gh = (...terms: (string | null | undefined)[]) => out.push({ provider: "github", family: "github", query: terms.filter(Boolean).map((t) => q(t!)).join(" ") });
    gh(school, programs[0]);
    // People write their school both ways in bios.
    if (shortName) gh(instName, programs[0]);
    if (programs[0] === "Computer Engineering") gh(school, "CompEng");
    for (const r of roles.slice(0, 2)) gh(school, r);
    for (const c of criteria.companies.slice(0, 4)) gh(school, c);
    // Lean towards people in the requested places (Canada by default); results are still checked one by one.
    const places = criteria.locations.length ? criteria.locations.slice(0, 2) : countrySearchTerms(criteria.country);
    for (const l of places) out.push({ provider: "github", family: "github", query: `${q(school)} location:${q(l)}` });
  }

  // ORCID's public registry: people's own education and employment records (Solr query syntax).
  if (instName) {
    const solr = (s: string) => `"${s.replace(/["\\]/g, "")}"`;
    const base = `affiliation-org-name:${solr(instName)}`;
    for (const p of programs.length ? programs : [null]) {
      out.push({ provider: "orcid", family: "orcid", query: p ? `${base} AND text:${solr(p)}` : base });
      for (const r of roles.slice(0, 2)) out.push({ provider: "orcid", family: "orcid", query: `${base} AND text:${solr(r)}${p ? ` AND text:${solr(p)}` : ""}` });
      for (const c of criteria.companies.slice(0, 6)) out.push({ provider: "orcid", family: "orcid", query: `${base} AND affiliation-org-name:${solr(c)}${p ? ` AND text:${solr(p)}` : ""}` });
    }
  }

  const seen = new Set<string>();
  const unique = out.filter((p) => {
    const key = `${p.provider}:${normalizeQuery(p.query)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Within each provider, interleave families so early queries cover different kinds of pages.
  const order: QueryFamily[] = ["core", "orcid", "github", "company", "alias", "location", "alumni", "university_site", "portfolio", "design_team", "research_lab"];
  const perProvider = (["web", "orcid", "github"] as const).map((provider) => {
    const byFamily = new Map<QueryFamily, PlannedQuery[]>();
    for (const p of unique.filter((u) => u.provider === provider)) byFamily.set(p.family, [...(byFamily.get(p.family) ?? []), p]);
    const list: PlannedQuery[] = [];
    while ([...byFamily.values()].some((l) => l.length)) {
      for (const f of order) {
        const next = byFamily.get(f)?.shift();
        if (next) list.push(next);
      }
    }
    return list;
  });
  // Then rotate across providers, so every batch of searches tries each source.
  const interleaved: PlannedQuery[] = [];
  for (let i = 0; perProvider.some((l) => i < l.length); i++) for (const l of perProvider) if (l[i]) interleaved.push(l[i]);
  return interleaved.slice(0, max);
}
