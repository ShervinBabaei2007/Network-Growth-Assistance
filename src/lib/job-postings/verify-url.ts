import { jobFixturesEnabled } from "@/lib/runtime-mode";
import type { AtsKind } from "./ats/types";
import { normCompany } from "./dedupe";

/**
 * Checks that a job's link is a real, job-specific posting link from where it claims to
 * come from, without fetching it. Links are only ever taken from provider data; this
 * decides whether one is trustworthy enough to show as verified.
 */

export type JobVerificationStatus = "verified" | "expired" | "unavailable" | "failed_validation" | "pending_validation";

export type UrlCheck = { ok: true; url: URL; canonical: string } | { ok: false; status: "failed_validation" | "unavailable" | "pending_validation"; reason: string };

const PLACEHOLDER_HOST = /(^|\.)(example\.(com|org|net)|localhost|local|test|invalid|example)$/i;
const PLACEHOLDER_TEXT = /placeholder|lorem|ipsum|your-?company|companyname|xxx+|\{\{|%7b%7b/i;
const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "buff.ly", "rebrand.ly", "cutt.ly", "is.gd", "lnkd.in", "shorturl.at"]);
const IP_HOST = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;
/** Pages that list jobs rather than show one. */
const GENERIC_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(careers?|jobs?|join(-us)?|work-with-us|opportunities|openings|positions|vacancies|search|results)?\/?$/i;
const SEARCH_PATH = /\/(search|jobs\/search|job-search|results)(\/|$)/i;
const SEARCH_PARAMS = ["q", "query", "keywords", "keyword", "search", "searchTerm"];

/** Hosts where each ATS shows individual postings. */
export const ATS_POSTING_HOSTS: Record<Exclude<AtsKind, "fixture">, RegExp> = {
  greenhouse: /^(boards|job-boards)(\.eu)?\.greenhouse\.io$/i,
  lever: /^jobs(\.eu)?\.lever\.co$/i,
  ashby: /^jobs\.ashbyhq\.com$/i,
  smartrecruiters: /^(jobs|careers)\.smartrecruiters\.com$/i,
  workable: /^apply\.workable\.com$/i,
  recruitee: /^[a-z0-9-]+\.recruitee\.com$/i,
  workday: /^[a-z0-9_-]+\.wd\d{1,3}\.myworkdayjobs\.com$/i,
};

const ALL_ATS_HOSTS = Object.values(ATS_POSTING_HOSTS);
export const isAtsHost = (host: string) => ALL_ATS_HOSTS.some((re) => re.test(host));

/** Job boards and search APIs whose own listing links we accept, by source. */
export const SOURCE_HOSTS: Record<"adzuna" | "jobicy" | "remotive" | "arbeitnow" | "usajobs" | "careerjet", RegExp> = {
  // Adzuna's site for each country its API serves (see ADZUNA_COUNTRIES): adzuna.ca, adzuna.de, adzuna.com.au…
  adzuna: /^(www\.)?adzuna\.(ca|com|co\.uk|at|be|ch|de|es|fr|in|it|nl|pl|sg|co\.nz|co\.za|com\.au|com\.br|com\.mx)$/i,
  jobicy: /^(www\.)?jobicy\.com$/i,
  remotive: /^(www\.)?remotive\.com$/i,
  arbeitnow: /^(www\.)?arbeitnow\.(com|co\.uk)$/i,
  usajobs: /^(www\.)?usajobs\.gov$/i,
  // Careerjet's country sites (see CAREERJET_LOCALES), e.g. jobviewer.careerjet.ca.
  careerjet: /^([a-z0-9-]+\.)?careerjet\.(ca|com|co\.uk|ie|com\.au|co\.nz|co\.in|co\.za|sg|de|at|ch|fr|be|nl|es|it|pl|com\.br|com\.mx)$/i,
};
const isAggregatorHost = (host: string) => Object.values(SOURCE_HOSTS).some((re) => re.test(host));

/** Hosts used only by fixture boards in tests; accepted only in fixture mode. */
const FIXTURE_HOSTS = new Set(["jobs.example.com"]);
/** Every fictional fixture job (board or job site) links under this prefix. */
export const FIXTURE_LINK_PREFIX = "https://jobs.example.com/";
export const isFixtureLink = (url: string | null | undefined) => Boolean(url?.startsWith(FIXTURE_LINK_PREFIX));

const TWO_PART_SUFFIXES = new Set(["co.uk", "org.uk", "ac.uk", "com.au", "co.nz", "co.jp", "com.br", "gc.ca", "on.ca", "bc.ca", "qc.ca", "ab.ca"]);

/** "careers.acme.co.uk" → "acme.co.uk". Good enough to compare an employer's own sites. */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  const lastTwo = parts.slice(-2).join(".");
  return TWO_PART_SUFFIXES.has(lastTwo) && parts.length >= 3 ? parts.slice(-3).join(".") : lastTwo;
}

/** Drops tracking parameters and fragments so the same posting gets one canonical URL. */
export function canonicalUrl(url: URL): string {
  const u = new URL(url.toString());
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) if (/^(utm_|gh_src|source|src|ref|referrer|lever-source|lever-origin|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  return u.toString().replace(/\/$/, "");
}

/** Shape checks every job link must pass: https, a real public hostname, no placeholders, a job-specific page. */
export function checkUrlShape(raw: string | null | undefined, opts: { allowFixtureHosts?: boolean } = {}): UrlCheck {
  if (!raw || !raw.trim()) return { ok: false, status: "unavailable", reason: "Application link unavailable" };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, status: "failed_validation", reason: "The link isn't a valid web address" };
  }
  const host = url.hostname.toLowerCase();
  const fixtureOk = (opts.allowFixtureHosts ?? jobFixturesEnabled()) && FIXTURE_HOSTS.has(host);
  if (url.protocol !== "https:") return { ok: false, status: "failed_validation", reason: "The link isn't a secure (https) address" };
  if (url.username || url.password) return { ok: false, status: "failed_validation", reason: "The link contains credentials" };
  if (url.port && url.port !== "443") return { ok: false, status: "failed_validation", reason: "The link uses an unusual port" };
  if (IP_HOST.test(host) || !host.includes(".")) return { ok: false, status: "failed_validation", reason: "The link has no real hostname" };
  if (!fixtureOk && PLACEHOLDER_HOST.test(host)) return { ok: false, status: "failed_validation", reason: "The link points to a placeholder domain" };
  if (PLACEHOLDER_TEXT.test(url.toString())) return { ok: false, status: "failed_validation", reason: "The link looks like a placeholder" };
  if (SHORTENERS.has(host.replace(/^www\./, ""))) return { ok: false, status: "failed_validation", reason: "Shortened links can't be traced to a posting" };
  if (GENERIC_PATH.test(url.pathname) && ![...url.searchParams.keys()].some((k) => /id$|^gh_jid$|^job/i.test(k))) {
    return { ok: false, status: "failed_validation", reason: "The link goes to a general careers or home page, not this job" };
  }
  if (SEARCH_PATH.test(url.pathname) || SEARCH_PARAMS.some((p) => url.searchParams.has(p))) {
    return { ok: false, status: "failed_validation", reason: "The link goes to search results, not this job" };
  }
  return { ok: true, url, canonical: canonicalUrl(url) };
}

export type LinkContext =
  | { source: "ats"; ats: AtsKind; boardToken: string; externalId: string; careersUrl: string | null; company: string | null }
  | { source: "adzuna" | "jobicy" | "remotive" | "arbeitnow" | "usajobs" | "careerjet"; externalId: string }
  | { source: "manual" };

/** Words in a hostname that could name the company ("acme-robotics.com" → ["acme", "robotics"]). */
const hostWords = (host: string) => registrableDomain(host).split(".")[0].split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

const MINOR_WORDS = new Set(["of", "the", "and", "for", "de", "la", "le", "et"]);

/**
 * Whether a host plausibly belongs to the named company: the domain contains its name or a
 * distinctive word of it, or is its initials ("Royal Bank of Canada" → rbc.com).
 */
export function hostMatchesCompany(host: string, company: string | null | undefined): boolean {
  const name = normCompany(company).replace(/\s+/g, "");
  if (!name) return false;
  const words = normCompany(company).split(" ").filter((w) => w.length >= 3);
  const domain = registrableDomain(host).split(".")[0].replace(/[^a-z0-9]/g, "");
  if (domain.length < 2) return false;
  const initials = (company ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !MINOR_WORDS.has(w))
    .map((w) => w[0])
    .join("");
  return domain.includes(name) || (domain.length >= 4 && name.includes(domain)) || words.some((w) => hostWords(host).includes(w) || domain.includes(w)) || (initials.length >= 2 && domain === initials);
}

/**
 * Shape plus relationship: the link must belong to the source it came from. An ATS job's
 * link is on that ATS (for that board or job) or on the employer's own site; a job from
 * Adzuna, Jobicy or Remotive links to that site's own page for that job, exactly as the
 * site gave it. Pasted links pass on shape alone.
 */
export function checkJobLink(raw: string | null | undefined, ctx: LinkContext, opts: { allowFixtureHosts?: boolean } = {}): UrlCheck {
  const shape = checkUrlShape(raw, opts);
  if (!shape.ok) return shape;
  const { url } = shape;
  const host = url.hostname.toLowerCase();
  const text = decodeURIComponent(url.pathname + url.search).toLowerCase();
  // Fixture links (tests and local demos only) stand in for every source.
  if (FIXTURE_HOSTS.has(host) && (opts.allowFixtureHosts ?? jobFixturesEnabled())) return shape;

  if (ctx.source === "ats") {
    if (ctx.ats === "fixture") return shape;
    const atsHost = ATS_POSTING_HOSTS[ctx.ats];
    const mentionsJob = text.includes(ctx.externalId.toLowerCase());
    if (atsHost.test(host)) {
      const mentionsBoard = text.includes(ctx.boardToken.toLowerCase()) || host.startsWith(`${ctx.boardToken.toLowerCase()}.`);
      return mentionsJob || mentionsBoard ? shape : { ok: false, status: "failed_validation", reason: "The link is for a different employer's board" };
    }
    if (isAtsHost(host) || isAggregatorHost(host)) return { ok: false, status: "failed_validation", reason: "The link points to a different job site than the employer's board" };
    // The employer's own careers site: same domain as its careers page, or a link that names this job.
    const sameEmployer = ctx.careersUrl ? registrableDomain(new URL(ctx.careersUrl).hostname) === registrableDomain(host) : false;
    if (sameEmployer || mentionsJob || hostMatchesCompany(host, ctx.company)) return shape;
    return { ok: false, status: "failed_validation", reason: "The link's website doesn't match the employer" };
  }

  if (ctx.source === "adzuna" || ctx.source === "jobicy" || ctx.source === "remotive" || ctx.source === "arbeitnow" || ctx.source === "usajobs" || ctx.source === "careerjet") {
    if (!SOURCE_HOSTS[ctx.source].test(host)) return { ok: false, status: "failed_validation", reason: "The link isn't the job board's own link" };
    return text.includes(ctx.externalId.toLowerCase()) ? shape : { ok: false, status: "failed_validation", reason: "The link isn't for this job" };
  }

  return shape;
}

/**
 * Where the link ends up after redirects must still be consistent with the company: an ATS
 * page, a known job board, or a site whose domain matches the company's name. A "Microsoft"
 * job that lands on an unrelated domain fails.
 */
export function checkFinalDestination(finalUrl: string, company: string | null | undefined, ctx: LinkContext): UrlCheck {
  const shape = checkUrlShape(finalUrl);
  if (!shape.ok) return shape.status === "unavailable" ? shape : { ok: false, status: "unavailable", reason: `The link now leads elsewhere: ${shape.reason.toLowerCase()}` };
  const host = shape.url.hostname.toLowerCase();
  if (isAtsHost(host) || isAggregatorHost(host) || hostMatchesCompany(host, company)) return shape;
  if (ctx.source === "ats" && ctx.careersUrl && registrableDomain(new URL(ctx.careersUrl).hostname) === registrableDomain(host)) return shape;
  if (ctx.source === "manual") return shape;
  // Not proof of a fake (employers use many domains), but not enough to call it verified.
  return { ok: false, status: "pending_validation", reason: `Couldn't confirm the destination site belongs to ${company?.trim() || "the employer"}` };
}
