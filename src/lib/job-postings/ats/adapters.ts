import { z } from "zod";
import { boardHtmlToText, BoardError, getJson, type AtsAdapter, type AtsJob, type BoardResult } from "./types";

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
    // The list without descriptions is small; descriptions are fetched only for new Canadian jobs.
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
    return j.success ? boardHtmlToText(j.data.content, { escaped: true }) : null;
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
          postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
          precision: "time",
          applyUrl: j.hostedUrl,
          description: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n").trim(),
          salary: j.salaryRange ? money(j.salaryRange.min, j.salaryRange.max, j.salaryRange.interval?.replace(/^per-/, "")) : null,
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
});
const SrDetail = z.object({
  postingUrl: s,
  jobAd: z.object({ sections: z.record(z.string(), z.object({ title: s, text: s }).nullish()) }).nullish(),
});

export const smartrecruiters: AtsAdapter = {
  kind: "smartrecruiters",
  label: "SmartRecruiters",
  boardUrl: (t) => `https://careers.smartrecruiters.com/${t}`,
  async fetchBoard(token, opts): Promise<BoardResult> {
    // The API filters by country, so only Canadian postings are listed (up to 300).
    const jobs: AtsJob[] = [];
    let etag: string | null = null;
    for (let offset = 0; offset < 300; offset += 100) {
      const r = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?country=ca&limit=100&offset=${offset}`, { ...opts, etag: offset === 0 ? opts.etag : null });
      if (r.notModified) return r;
      if (offset === 0) etag = r.etag;
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
          applyUrl: `https://jobs.smartrecruiters.com/${token}/${j.id}`,
          description: null,
          salary: null,
          employmentType: j.typeOfEmployment?.label ?? null,
          department: j.department?.label ?? null,
        })),
      );
      if (offset + 100 >= page.data.totalFound) break;
    }
    return { notModified: false, etag, jobs };
  },
  async fetchDetail(token, id, opts) {
    const r = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings/${encodeURIComponent(id)}`, opts);
    if (r.notModified) return null;
    const d = SrDetail.safeParse(r.body);
    if (!d.success) return null;
    return Object.values(d.data.jobAd?.sections ?? {})
      .filter((sec) => sec?.text)
      .map((sec) => `${sec!.title ?? ""}\n${boardHtmlToText(sec!.text)}`)
      .join("\n")
      .trim();
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
        applyUrl: j.url ?? `https://apply.workable.com/j/${j.shortcode}`,
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
