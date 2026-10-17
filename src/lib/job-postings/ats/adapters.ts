import { z } from "zod";
import { countryCode, countryName } from "@/lib/geo/countries";
import { boardHtmlToText, BoardError, getJson, type AtsAdapter, type AtsJob, type BoardResult, type ExperienceLevel, type SalaryRange } from "./types";

/**
 * One adapter per ATS. Every field is optional in the schemas: a malformed job is
 * skipped instead of failing the board. Response shapes were checked against live
 * boards and are pinned by the fixtures in ats.test.ts.
 */

const s = z.string().nullish();
const n = z.number().nullish();
const parseJobs = <T>(schema: z.ZodType<T>, list: unknown[], map: (j: T) => AtsJob | null): AtsJob[] =>
  list.flatMap((raw) => {
    const p = schema.safeParse(raw);
    if (!p.success) return [];
    const job = map(p.data);
    return job ? [job] : [];
  });

const money = (min: number | null | undefined, max: number | null | undefined, unit?: string | null) => {
  if (!min && !max) return null;
  const f = (v: number) => `$${Math.round(v).toLocaleString("en-CA")}`;
  const range = min && max ? `${f(min)}–${f(max)}` : f((min ?? max)!);
  return unit ? `${range} per ${unit.toLowerCase()}` : range;
};

/** A pay period from the board's wording ("per-year-salary", "HOURLY", "month"). */
export const payPeriod = (text: string | null | undefined): SalaryRange["period"] => {
  const t = (text ?? "").toLowerCase();
  return /year|annual/.test(t) ? "year" : /month/.test(t) ? "month" : /week/.test(t) ? "week" : /\bday|daily/.test(t) ? "day" : /hour/.test(t) ? "hour" : null;
};

/** A workplace type from a board's structured field ("OnSite", "hybrid", "remote"); null when unspecified. */
export const workplaceOf = (value: string | null | undefined): AtsJob["workplace"] => {
  const v = (value ?? "").toLowerCase().replace(/[\s_-]/g, "");
  return v === "remote" ? "remote" : v === "hybrid" ? "hybrid" : v === "onsite" || v === "inoffice" ? "onsite" : null;
};

// ------------------------------------------------------------------ Greenhouse

const GhJob = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  absolute_url: z.string(),
  first_published: s,
  location: z.object({ name: s }).nullish(),
  company_name: s,
  content: s,
  departments: z.array(z.object({ name: s })).nullish(),
});

export const greenhouse: AtsAdapter = {
  kind: "greenhouse",
  label: "Greenhouse",
  boardUrl: (t) => `https://boards.greenhouse.io/${t}`,
  async fetchBoard(token, opts): Promise<BoardResult> {
    // The list without descriptions is small; descriptions are fetched only for new jobs that are kept.
    const r = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`, opts);
    if (r.notModified) return r;
    const list = z.object({ jobs: z.array(z.unknown()) }).safeParse(r.body);
    if (!list.success) throw new BoardError("Unexpected Greenhouse response.");
    return {
      notModified: false,
      etag: r.etag,
      jobs: parseJobs(GhJob, list.data.jobs, (j) => ({
        externalId: String(j.id),
        title: j.title,
        company: j.company_name ?? null,
        places: j.location?.name ? [{ text: j.location.name }] : [],
        remote: /\bremote\b/i.test(j.location?.name ?? ""),
        postedAt: j.first_published ?? null,
        precision: "time",
        applyUrl: j.absolute_url,
        description: null,
        salary: null,
        employmentType: null,
        department: j.departments?.[0]?.name ?? null,
      })),
    };
  },
  async fetchDetail(token, id, opts) {
    const r = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${encodeURIComponent(id)}`, opts);
    if (r.notModified) return null;
    const j = GhJob.safeParse(r.body);
    return j.success ? { description: boardHtmlToText(j.data.content, { escaped: true }) } : null;
  },
};

// ------------------------------------------------------------------ Lever

const LeverJob = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  createdAt: n,
  country: s,
  workplaceType: s,
  categories: z.object({ location: s, allLocations: z.array(z.string()).nullish(), commitment: s, team: s }).nullish(),
  descriptionPlain: s,
  lists: z.array(z.object({ text: s, content: s })).nullish(),
  additionalPlain: s,
  salaryRange: z.object({ min: n, max: n, interval: s, currency: s }).nullish(),
});

export const lever: AtsAdapter = {
  kind: "lever",
  label: "Lever",
  boardUrl: (t) => `https://jobs.lever.co/${t}`,
  async fetchBoard(token, opts): Promise<BoardResult> {
    const r = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`, opts);
    if (r.notModified) return r;
    if (!Array.isArray(r.body)) throw new BoardError("Unexpected Lever response.");
    return {
      notModified: false,
      etag: r.etag,
      jobs: parseJobs(LeverJob, r.body, (j) => {
        const locations = j.categories?.allLocations?.length ? j.categories.allLocations : j.categories?.location ? [j.categories.location] : [];
        // Lists are the posting's sections ("What you'll need"): keep them as heading + lines.
        const lists = (j.lists ?? []).map((l) => `${l.text ?? ""}\n${boardHtmlToText(l.content)}`).join("\n");
        return {
          externalId: j.id,
          title: j.text,
          company: null,
          // Lever's country is the posting's; locations may name several cities.
          places: locations.map((text) => ({ text, country: locations.length === 1 ? j.country : null })),
          remote: j.workplaceType === "remote",
          workplace: workplaceOf(j.workplaceType),
          // Lever's public API gives only when the posting was created, not when it was published.
          postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
          precision: "time",
          dateNote: "created",
          applyUrl: j.hostedUrl,
          description: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n").trim(),
          salary: j.salaryRange ? money(j.salaryRange.min, j.salaryRange.max, payPeriod(j.salaryRange.interval)) : null,
          salaryRange:
            j.salaryRange && (j.salaryRange.min || j.salaryRange.max)
              ? { min: j.salaryRange.min ?? null, max: j.salaryRange.max ?? null, currency: j.salaryRange.currency?.toUpperCase() ?? null, period: payPeriod(j.salaryRange.interval) }
              : null,
          employmentType: j.categories?.commitment ?? null,
          department: j.categories?.team ?? null,
        };
      }),
    };
  },
};

// ------------------------------------------------------------------ Ashby

const AshbyAddress = z.object({ postalAddress: z.object({ addressLocality: s, addressRegion: s, addressCountry: s }).nullish() }).nullish();
const AshbyJob = z.object({
  id: z.string(),
  title: z.string(),
  jobUrl: z.string(),
  publishedAt: s,
  isListed: z.boolean().nullish(),
  isRemote: z.boolean().nullish(),
  workplaceType: s,
  location: s,
  address: AshbyAddress,
  secondaryLocations: z.array(z.object({ location: s, address: AshbyAddress })).nullish(),
  descriptionPlain: s,
  employmentType: s,
  department: s,
  compensation: z.object({ compensationTierSummary: s, scrapeableCompensationSalarySummary: s }).nullish(),
});

const ashbyPlace = (text: string | null | undefined, a: z.infer<typeof AshbyAddress>) => ({
  text: text ?? [a?.postalAddress?.addressLocality, a?.postalAddress?.addressRegion].filter(Boolean).join(", "),
  city: a?.postalAddress?.addressLocality ?? null,
  region: a?.postalAddress?.addressRegion ?? null,
  country: a?.postalAddress?.addressCountry ?? null,
});

export const ashby: AtsAdapter = {
  kind: "ashby",
  label: "Ashby",
  boardUrl: (t) => `https://jobs.ashbyhq.com/${t}`,
  async fetchBoard(token, opts): Promise<BoardResult> {
    const r = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`, opts);
    if (r.notModified) return r;
    const list = z.object({ jobs: z.array(z.unknown()) }).safeParse(r.body);
    if (!list.success) throw new BoardError("Unexpected Ashby response.");
    return {
      notModified: false,
      etag: r.etag,
      jobs: parseJobs(AshbyJob, list.data.jobs, (j) =>
        j.isListed === false
          ? null
          : {
              externalId: j.id,
              title: j.title,
              company: null,
              places: [ashbyPlace(j.location, j.address), ...(j.secondaryLocations ?? []).map((l) => ashbyPlace(l.location, l.address))],
              remote: Boolean(j.isRemote) || j.workplaceType === "Remote",
              workplace: workplaceOf(j.workplaceType) ?? (j.isRemote ? "remote" : null),
              postedAt: j.publishedAt ?? null,
              precision: "time",
              applyUrl: j.jobUrl,
              description: j.descriptionPlain ?? "",
              salary: j.compensation?.scrapeableCompensationSalarySummary ?? j.compensation?.compensationTierSummary ?? null,
              employmentType: j.employmentType ?? null,
              department: j.department ?? null,
            },
      ),
    };
  },
};

// ------------------------------------------------------------------ SmartRecruiters

const SrJob = z.object({
  id: z.string(),
  name: z.string(),
  releasedDate: s,
  company: z.object({ name: s, identifier: s }).nullish(),
  location: z.object({ city: s, region: s, country: s, remote: z.boolean().nullish(), fullLocation: s }).nullish(),
  department: z.object({ label: s }).nullish(),
  typeOfEmployment: z.object({ label: s }).nullish(),
  experienceLevel: z.object({ id: s }).nullish(),
});
const SrDetail = z.object({
  postingUrl: s,
  jobAd: z.object({ sections: z.record(z.string(), z.object({ title: s, text: s }).nullish()) }).nullish(),
});

// SmartRecruiters' own experience levels; the broad ones ("mid_senior_level") are left to the title.
const SR_LEVELS: Record<string, ExperienceLevel> = { internship: "internship", entry_level: "entry", associate: "junior" };
const SR_PAGES = 3;
/** With more searched countries than this, the board is read without a country filter. */
const SR_MAX_COUNTRY_QUERIES = 6;

export const smartrecruiters: AtsAdapter = {
  kind: "smartrecruiters",
  label: "SmartRecruiters",
  boardUrl: (t) => `https://careers.smartrecruiters.com/${t}`,
  async fetchBoard(token, opts): Promise<BoardResult> {
    // The API filters by country: each searched country is asked for (up to 300 postings
    // each), so a big employer's jobs in those countries aren't crowded out by the rest.
    const countries = (opts.countries ?? ["CA"]).filter((c) => /^[A-Z]{2}$/.test(c));
    const filters = countries.length && countries.length <= SR_MAX_COUNTRY_QUERIES ? countries.map((c) => `country=${c.toLowerCase()}&`) : [""];
    const jobs: AtsJob[] = [];
    const seen = new Set<string>();
    let etag: string | null = null;
    let partial = false;
    for (const [qi, filter] of filters.entries()) {
    for (let offset = 0; offset < SR_PAGES * 100; offset += 100) {
      // An unchanged answer only counts when one query covers the whole board.
      const first = qi === 0 && offset === 0;
      const r = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?${filter}limit=100&offset=${offset}`, { ...opts, etag: first && filters.length === 1 ? opts.etag : null });
      if (r.notModified) return r;
      if (first && filters.length === 1) etag = r.etag;
      const page = z.object({ content: z.array(z.unknown()), totalFound: z.number() }).safeParse(r.body);
      if (!page.success) throw new BoardError("Unexpected SmartRecruiters response.");
      jobs.push(
        ...parseJobs(SrJob, page.data.content, (j) => ({
          externalId: j.id,
          title: j.name,
          company: j.company?.name ?? null,
          places: [{ text: j.location?.fullLocation ?? [j.location?.city, j.location?.region].filter(Boolean).join(", "), city: j.location?.city, region: j.location?.region, country: j.location?.country }],
          remote: Boolean(j.location?.remote),
          postedAt: j.releasedDate ?? null,
          precision: "time",
          // The list has no public link; fetchDetail reads the posting's own postingUrl.
          applyUrl: null,
          description: null,
          salary: null,
          employmentType: j.typeOfEmployment?.label ?? null,
          department: j.department?.label ?? null,
          level: SR_LEVELS[j.experienceLevel?.id ?? ""] ?? null,
        })),
      );
      if (offset + 100 >= page.data.totalFound) break;
      if (offset + 100 >= SR_PAGES * 100) partial = true;
    }
    }
    // A job listed in two searched countries is one job.
    const unique = jobs.filter((j) => (seen.has(j.externalId) ? false : (seen.add(j.externalId), true)));
    // Per-country reads can't tell what closed elsewhere on the board.
    return { notModified: false, etag, jobs: unique, partial: partial || filters.length > 1 || filters[0] !== "" };
  },
  async fetchDetail(token, id, opts) {
    const r = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings/${encodeURIComponent(id)}`, opts);
    if (r.notModified) return null;
    const d = SrDetail.safeParse(r.body);
    if (!d.success) return null;
    const description = Object.values(d.data.jobAd?.sections ?? {})
      .filter((sec) => sec?.text)
      .map((sec) => `${sec!.title ?? ""}\n${boardHtmlToText(sec!.text)}`)
      .join("\n")
      .trim();
    return { description: description || null, applyUrl: d.data.postingUrl ?? null };
  },
};

// ------------------------------------------------------------------ Workable

const WkJob = z.object({
  shortcode: z.string(),
  title: z.string(),
  url: s,
  application_url: s,
  published_on: s,
  telecommuting: z.boolean().nullish(),
  employment_type: s,
  department: s,
  country: s,
  city: s,
  state: s,
  locations: z.array(z.object({ country: s, countryCode: s, city: s, region: s })).nullish(),
  description: s,
});

export const workable: AtsAdapter = {
  kind: "workable",
  label: "Workable",
  boardUrl: (t) => `https://apply.workable.com/${t}/`,
  async fetchBoard(token, opts): Promise<BoardResult> {
    const r = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}?details=true`, opts);
    if (r.notModified) return r;
    const list = z.object({ name: s, jobs: z.array(z.unknown()) }).safeParse(r.body);
    if (!list.success) throw new BoardError("Unexpected Workable response.");
    return {
      notModified: false,
      etag: r.etag,
      jobs: parseJobs(WkJob, list.data.jobs, (j) => ({
        externalId: j.shortcode,
        title: j.title,
        company: list.data.name ?? null,
        places: j.locations?.length
          ? j.locations.map((l) => ({ text: [l.city, l.region, l.country].filter(Boolean).join(", "), city: l.city, region: l.region, country: l.countryCode ?? l.country }))
          : [{ text: [j.city, j.state, j.country].filter(Boolean).join(", "), city: j.city, region: j.state, country: j.country }],
        remote: Boolean(j.telecommuting),
        // Workable gives a date without a time.
        postedAt: j.published_on ? `${j.published_on}T00:00:00Z` : null,
        precision: "day",
        // Only the board's own link; a job without one shows "Application link unavailable".
        applyUrl: j.url ?? j.application_url ?? null,
        description: boardHtmlToText(j.description),
        salary: null,
        employmentType: j.employment_type ?? null,
        department: j.department ?? null,
      })),
    };
  },
};

// ------------------------------------------------------------------ Recruitee

const RcJob = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  careers_url: s,
  published_at: s,
  city: s,
  state_name: s,
  state_code: s,
  country_code: s,
  remote: z.boolean().nullish(),
  description: s,
  requirements: s,
  department: s,
  company_name: s,
  employment_type_code: s,
  locations: z.array(z.object({ city: s, state: s, state_code: s, country_code: s })).nullish(),
});

export const recruitee: AtsAdapter = {
  kind: "recruitee",
  label: "Recruitee",
  boardUrl: (t) => `https://${t}.recruitee.com/`,
  async fetchBoard(token, opts): Promise<BoardResult> {
    const r = await getJson(`https://${encodeURIComponent(token)}.recruitee.com/api/offers/`, opts);
    if (r.notModified) return r;
    const list = z.object({ offers: z.array(z.unknown()) }).safeParse(r.body);
    if (!list.success) throw new BoardError("Unexpected Recruitee response.");
    return {
      notModified: false,
      etag: r.etag,
      jobs: parseJobs(RcJob, list.data.offers, (j) =>
        j.careers_url
          ? {
              externalId: String(j.id),
              title: j.title,
              company: j.company_name ?? null,
              places: j.locations?.length
                ? j.locations.map((l) => ({ text: [l.city, l.state].filter(Boolean).join(", "), city: l.city, region: l.state_code ?? l.state, country: l.country_code }))
                : [{ text: [j.city, j.state_name].filter(Boolean).join(", "), city: j.city, region: j.state_code ?? j.state_name, country: j.country_code }],
              remote: Boolean(j.remote),
              // "2026-10-05 16:05:18 UTC"
              postedAt: j.published_at ? j.published_at.replace(" UTC", "Z").replace(" ", "T") : null,
              precision: "time",
              applyUrl: j.careers_url,
              description: [boardHtmlToText(j.description), boardHtmlToText(j.requirements)].filter(Boolean).join("\n"),
              salary: null,
              employmentType: j.employment_type_code?.replace(/_/g, " ") ?? null,
              department: j.department ?? null,
            }
          : null,
      ),
    };
  },
};

// ------------------------------------------------------------------ Workday

/**
 * Workday career sites ({tenant}.wd{N}.myworkdayjobs.com/{site}) all run on the same public
 * JSON API that the careers page itself calls. The board token is "tenant.wdN.site". The
 * list is read 20 postings at a time and filtered by country; links and descriptions come
 * from each posting's detail (`externalUrl` is Workday's own link, never built from a pattern).
 */

const WD_TOKEN = /^([A-Za-z0-9_-]+)\.(wd\d{1,3})\.([A-Za-z0-9_-]+)$/;
const WD_PAGE = 20;
/** Pages read per searched country: the newest 300 postings there. */
export const WD_PAGES = 15;

export function workdayParts(token: string): { tenant: string; pod: string; site: string; base: string } {
  const m = WD_TOKEN.exec(token);
  if (!m) throw new BoardError("Not a Workday board token (tenant.wdN.site).", true);
  const [, tenant, pod, site] = m;
  return { tenant, pod, site, base: `https://${tenant}.${pod}.myworkdayjobs.com/wday/cxs/${tenant}/${site}` };
}

type WdFacetValue = { id?: string | null; descriptor?: string | null; facetParameter?: string | null; values?: WdFacetValue[] | null };
const WdFacet: z.ZodType<WdFacetValue> = z.lazy(() => z.object({ id: s, descriptor: s, facetParameter: s, values: z.array(WdFacet).nullish() }));
const WdList = z.object({ total: z.number().nullish(), jobPostings: z.array(z.unknown()), facets: z.array(WdFacet).nullish() });
const WdJob = z.object({ title: z.string(), externalPath: z.string(), locationsText: s, postedOn: s });
const WdDetail = z.object({
  jobPostingInfo: z.object({
    jobDescription: s,
    location: s,
    additionalLocations: z.array(z.string()).nullish(),
    externalUrl: s,
    country: z.object({ descriptor: s }).nullish(),
    jobRequisitionLocation: z.object({ country: z.object({ alpha2Code: s }).nullish() }).nullish(),
  }),
});

/**
 * The facet that filters by country, and each searched country's value id in it. Tenants
 * name it differently ("locationCountry", "Location_Country", "locationHierarchy1"), and it
 * may sit inside a location group, so it's recognised by its values: mostly country names.
 */
export function workdayCountryFacet(facets: WdFacetValue[], countries: readonly string[]): { param: string; ids: Map<string, string> } | null {
  const groups: { param: string; values: WdFacetValue[] }[] = [];
  const walk = (list: WdFacetValue[]) => {
    for (const f of list) {
      if (!f.facetParameter || !f.values?.length) continue;
      if (f.values.some((v) => v.id)) groups.push({ param: f.facetParameter, values: f.values });
      walk(f.values);
    }
  };
  walk(facets);
  let best: { param: string; ids: Map<string, string>; share: number } | null = null;
  for (const g of groups) {
    const named = g.values.filter((v) => v.id && v.descriptor);
    const codes = named.map((v) => countryCode(v.descriptor));
    const share = named.length ? codes.filter(Boolean).length / named.length : 0;
    if (share < 0.6 || (best && share <= best.share)) continue;
    const ids = new Map<string, string>();
    named.forEach((v, i) => {
      const code = codes[i];
      if (code && countries.includes(code)) ids.set(code, v.id!);
    });
    best = { param: g.param, ids, share };
  }
  return best ? { param: best.param, ids: best.ids } : null;
}

/** "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" / "Posted 30+ Days Ago" → that day (UTC), or null. */
export function workdayPostedOn(text: string | null | undefined, now = Date.now()): string | null {
  const t = (text ?? "").toLowerCase();
  const days = /today/.test(t) ? 0 : /yesterday/.test(t) ? 1 : Number(/(\d+)\+?\s*days?/.exec(t)?.[1] ?? NaN);
  if (!Number.isFinite(days)) return null;
  return new Date(now - days * 86_400_000).toISOString().slice(0, 10);
}

/** "2 Locations" says nothing about where. */
const vagueWhere = (text: string | null | undefined) => !text || /^\d+\s+locations?$/i.test(text.trim());

export const workday: AtsAdapter = {
  kind: "workday",
  label: "Workday",
  detailsPerRead: 120,
  boardTimeoutMs: 35_000,
  // Big boards read page by page: less often, so they don't crowd out the other boards.
  activeIntervalMin: 180,
  boardUrl: (t) => {
    const { tenant, pod, site } = workdayParts(t);
    return `https://${tenant}.${pod}.myworkdayjobs.com/${site}`;
  },
  async fetchBoard(token, opts): Promise<BoardResult> {
    const { base } = workdayParts(token);
    const countries = (opts.countries ?? ["CA"]).filter((c) => /^[A-Z]{2}$/.test(c));
    const page = async (appliedFacets: Record<string, string[]>, offset: number) => {
      const r = await getJson(`${base}/jobs`, { signal: opts.signal, body: { appliedFacets, limit: WD_PAGE, offset, searchText: "" } });
      const p = r.notModified ? null : WdList.safeParse(r.body);
      if (!p?.success) throw new BoardError("Unexpected Workday response.");
      return p.data;
    };
    const first = await page({}, 0);
    const facet = workdayCountryFacet(first.facets ?? [], countries);
    // One series per searched country the board lists, so each job's country is known;
    // with no country facet, the board is read as it comes.
    const series: { country: string | null; facets: Record<string, string[]> }[] = facet
      ? [...facet.ids].map(([country, id]) => ({ country, facets: { [facet.param]: [id] } }))
      : [{ country: null, facets: {} }];
    const jobs: AtsJob[] = [];
    const seen = new Set<string>();
    let capped = false;
    for (const q of series) {
      // Workday gives the total on a series' first page only (later pages say 0).
      let total = 0;
      for (let n = 0; n < WD_PAGES; n++) {
        const data = q.country === null && n === 0 ? first : await page(q.facets, n * WD_PAGE);
        if (n === 0) total = data.total ?? 0;
        const parsed = parseJobs(WdJob, data.jobPostings, (j) => {
          const where = vagueWhere(j.locationsText) ? "" : (j.locationsText ?? "");
          const text = [where, q.country ? countryName(q.country) : null].filter(Boolean).join(", ");
          return {
            // The posting's path ("job/Toronto/Analyst_R123"): its link contains it, and its detail is read by it.
            externalId: j.externalPath.replace(/^\/+/, "").slice(0, 200),
            title: j.title,
            company: null,
            places: text ? [{ text, country: q.country }] : [],
            remote: /\bremote\b/i.test(where),
            postedAt: workdayPostedOn(j.postedOn),
            precision: "day",
            applyUrl: null,
            description: null,
            salary: null,
            employmentType: null,
            department: null,
          };
        });
        for (const j of parsed) if (!seen.has(j.externalId)) jobs.push((seen.add(j.externalId), j));
        if ((n + 1) * WD_PAGE >= total || !data.jobPostings.length) break;
        if (n + 1 === WD_PAGES) capped = true;
      }
    }
    // Read by country (and capped): what isn't listed here can't be judged closed from this read.
    return { notModified: false, etag: null, jobs, partial: capped || facet !== null };
  },
  async fetchDetail(token, id, opts) {
    const { base } = workdayParts(token);
    const r = await getJson(`${base}/${id.split("/").map(encodeURIComponent).join("/")}`, opts);
    if (r.notModified) return null;
    const d = WdDetail.safeParse(r.body);
    if (!d.success) return null;
    const i = d.data.jobPostingInfo;
    const country = i.jobRequisitionLocation?.country?.alpha2Code ?? countryCode(i.country?.descriptor) ?? null;
    const places = [i.location, ...(i.additionalLocations ?? [])].filter((t): t is string => Boolean(t)).map((text, k) => ({ text, country: k === 0 ? country : null }));
    return { description: boardHtmlToText(i.jobDescription) || null, applyUrl: i.externalUrl ?? null, places: places.length ? places : null };
  },
};
