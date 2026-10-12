import { Suspense } from "react";
import Link from "next/link";
import { Building2, FileText, Plus, Search, SlidersHorizontal } from "lucide-react";
import type { TierKey } from "@/components/jobs/job-visuals";
import { TIER_STYLE } from "@/components/jobs/job-visuals";
import { JobCard, type CardJob } from "@/components/jobs/job-card";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { NativeSelect } from "@/components/native-select";
import { PageHeader } from "@/components/page-header";
import { ToastOnMount } from "@/components/toast/toast-on-mount";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AtsKind } from "@/lib/job-postings/ats/types";
import { dedupeJobs, type DedupeItem } from "@/lib/job-postings/dedupe";
import { chooseRange, expansionNotice, parseRange, RANGES, rangeSince, relatedTitles, titleQuery, type Range } from "@/lib/job-postings/feed";
import { activeFilterCount, matchesFilters, parseFilters, type Filters } from "@/lib/job-postings/filters";
import { explainFit, prefilterScore } from "@/lib/job-postings/fit";
import { timeAgo } from "@/lib/job-postings/labels";
import { LEVEL_LABELS, LEVELS, SENIORITY_LEVELS, WORKPLACE_LABELS } from "@/lib/job-postings/levels";
import { searchProviders } from "@/lib/job-postings/providers/registry";
import { rankScore } from "@/lib/job-postings/rank";
import { byPriority } from "@/lib/job-postings/regions";
import { StoredFit } from "@/lib/job-postings/schemas";
import { providerTrouble, refreshFromProviders, type SourceNotice } from "@/lib/job-postings/search";
import { chunk, loadActiveResume, MAX_SCORED_PER_VIEW, scoreJobs } from "@/lib/job-postings/service";
import { jobServices } from "@/lib/job-postings/services";
import { alsoListedOn, jobSource } from "@/lib/job-postings/source";
import { externalSearchLinks } from "@/lib/job-postings/external-search";
import { skillsIn } from "@/lib/job-postings/taxonomy";
import { scheduleVerifyPending } from "@/lib/job-postings/verify-job";
import { FIXTURE_LINK_PREFIX, isFixtureLink } from "@/lib/job-postings/verify-url";
import { ANYWHERE, countryName, countryOptions, currencyOf, isCountryCode, scopeFor } from "@/lib/geo/countries";
import { PROVINCE_CODES, PROVINCE_NAMES, SENIORITY, SENIORITY_LABELS, type ProvinceCode, type Seniority } from "@/lib/job-postings/types";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { saveJobPreferences } from "./actions";

export const metadata = { title: "Jobs · Network Growth" };
// A search may ask Jobicy (and Adzuna, if configured) for fresh results (8 s at most) and check fit for new postings.
export const maxDuration = 60;

const TABS = [
  { key: "all", label: "All results", tier: "unchecked" },
  { key: "fit", label: "Good fit", tier: "strong" },
  { key: "stretch", label: "Stretch", tier: "stretch" },
  { key: "excluded", label: "Doesn't qualify", tier: "excluded" },
  { key: "saved", label: "Saved & applied", tier: "good" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const PAGE = 25;
/** The most postings one search loads. */
const MAX_ROWS = 1000;

export default function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Jobs"
        description="Real, recent postings in any country and any field: from employers' own job boards, plus Jobicy, Remotive and Arbeitnow (and USAJOBS when set up). Each listing shows where it came from and whether its link is verified, and is checked against your resume."
        actions={
          <>
            <Link href="/jobs/resume" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileText aria-hidden /> Resume
            </Link>
            <Link href="/jobs/employers" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Building2 aria-hidden /> Employers
            </Link>
            <Link href="/jobs/add" className={buttonVariants({ size: "sm" })}>
              <Plus aria-hidden /> Paste a posting
            </Link>
          </>
        }
      />
      <Suspense fallback={<SearchingState />}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function SearchingState() {
  return (
    <div role="status" aria-live="polite" className="grid gap-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Search aria-hidden className="size-4 animate-pulse" /> Searching verified job sources…
      </p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/40" />
      ))}
    </div>
  );
}

const JOB_FIELDS =
  "id, title, company, city, province, country, countries, remote, workplace_type, posted_at, date_source, date_note, source, user_id, employer_id, salary, salary_min, salary_max, salary_currency, salary_period, employment_type, experience_level, level_source, apply_url, verification_status, verification_note, closed_at, description, dedupe_key, desc_fingerprint, description_is_partial, canonical_url";
type Row = CardJob & {
  employer_id: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  description: string;
  dedupe_key: string | null;
  desc_fingerprint: string | null;
  description_is_partial: boolean;
  canonical_url: string | null;
};
type EmployerInfo = { name: string; ats: AtsKind; careers_url: string | null };

/** A province named in the "where" box ("BC", "Ontario"), if any. */
function provinceIn(where: string): ProvinceCode | null {
  const w = where.trim().toLowerCase();
  if (!w) return null;
  return PROVINCE_CODES.find((p) => p.toLowerCase() === w || PROVINCE_NAMES[p].toLowerCase() === w) ?? null;
}

async function Feed({ searchParams }: Pick<PageProps<"/jobs">, "searchParams">) {
  const raw = await searchParams;
  // Checkbox groups arrive as repeated params (level=a&level=b): joined, they read like "a,b".
  const given: Record<string, string> = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : (v ?? "")]));
  // Absent params read as "".
  const sp = new Proxy(given, { get: (t, k) => (typeof k === "string" ? (t[k] ?? "") : undefined) });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const services = jobServices();

  const [{ data: settings }, resume, { data: lastRun }, { count: employerCount }, { data: states }] = await Promise.all([
    supabase.from("settings").select("job_titles, job_country, job_provinces, job_seniority, job_exclude_keywords").single(),
    loadActiveResume(supabase),
    supabase.from("job_crawl_runs").select("finished_at").not("finished_at", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("employers").select("id", { count: "exact", head: true }).neq("status", "disabled").neq("ats", "fixture"),
    supabase.from("job_user_states").select("job_id, status"),
  ]);
  if (!settings || !userId) return <LoadError what="postings" />;

  const q = sp.q.trim().slice(0, 120);
  const where = sp.where.trim().slice(0, 80);
  const allTitles = sp.all === "1";
  const searched = q ? [q] : allTitles ? [] : settings.job_titles;
  const explicitRange = parseRange(sp.range);
  // The user's level setting is the default level filter until they choose levels (or none) themselves.
  const levelChosen = raw.level !== undefined;
  const filters: Filters = levelChosen ? parseFilters(sp) : { ...parseFilters(sp), levels: SENIORITY_LEVELS[settings.job_seniority as Seniority], levelStrict: false };
  const tab: Tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "all") as Tab;
  const page = Math.max(1, Number(sp.page) || 1);
  // One country at a time: the one in the URL, else the user's own ("*" = remote jobs open anywhere).
  const askedCountry = sp.country.trim().toUpperCase();
  const country = askedCountry === ANYWHERE || isCountryCode(askedCountry) ? askedCountry : settings.job_country;
  const inCanada = country === "CA";
  const currency = currencyOf(country);
  const provinces = byPriority(settings.job_provinces);
  const whereProvince = inCanada ? provinceIn(where) : null;
  const provFilter = !inCanada ? [] : whereProvince ? [whereProvince] : sp.prov.split(",").filter((p): p is ProvinceCode => (PROVINCE_CODES as readonly string[]).includes(p));
  const shownProvinces = provFilter.length ? provFilter : provinces;
  const placeName = country === ANYWHERE ? "remote jobs open anywhere" : inCanada ? shownProvinces.map((p) => PROVINCE_NAMES[p]).join(", ") : (countryName(country) ?? country);

  // 1. Fresh results from the search providers (Jobicy; Adzuna if configured), cached per search.
  const registry = searchProviders();
  const windowRange: Range = explicitRange ?? RANGES.find((r) => r.key === "7d")!;
  let notices: SourceNotice[] = [];
  if (searched[0]) {
    notices = await refreshFromProviders(registry.providers, {
      what: searched[0],
      country,
      where: whereProvince ? PROVINCE_NAMES[whereProvince] : where || null,
      maxDaysOld: Math.round(windowRange.hours / 24),
      page: Math.max(1, Math.ceil((page * PAGE) / 50)),
    });
    // New results start unverified: check their links right after this page is sent.
    if (registry.providers.length) scheduleVerifyPending();
  }
  // Listings just fetched (not from the cache) that are still being checked.
  const newlyFetched = notices.filter((n) => n.outcome === "ok").reduce((sum, n) => sum + n.count, 0);

  // 2. Every source, in one query: open, dated, in the window, verified (or unchecked when asked), open to the
  // country (there, or remote and open to it, its region or anywhere) and, in Canada, in the user's provinces.
  const statuses: ("verified" | "pending_validation")[] = filters.includeUnchecked ? ["verified", "pending_validation"] : ["verified"];
  const scope = scopeFor(country);
  const placeOr = `province.in.(${shownProvinces.join(",")}),and(province.is.null,remote.is.true)`;
  let query = supabase
    .from("jobs")
    .select(JOB_FIELDS)
    .gte("posted_at", rangeSince(windowRange))
    .is("closed_at", null)
    .neq("date_source", "unknown")
    .in("verification_status", statuses)
    .overlaps("countries", scope)
    .order("posted_at", { ascending: false })
    .limit(MAX_ROWS);
  let excludedQuery = supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .gte("posted_at", rangeSince(windowRange))
    .is("closed_at", null)
    .in("verification_status", ["failed_validation", "unavailable", "expired"])
    .overlaps("countries", scope);
  if (inCanada) {
    query = query.or(placeOr);
    excludedQuery = excludedQuery.or(placeOr);
  }
  const tsq = searched.length ? titleQuery(searched) : null;
  if (tsq) {
    query = query.textSearch("fts", tsq, { config: "english" });
    excludedQuery = excludedQuery.textSearch("fts", tsq, { config: "english" });
  }
  if (services.fixtures) {
    // Fixture mode (tests and demos): only fictional jobs and your own pastes, whatever real data the database holds.
    const fixtureOnly = `apply_url.like."${FIXTURE_LINK_PREFIX}*",user_id.not.is.null`;
    query = query.or(fixtureOnly);
    excludedQuery = excludedQuery.or(fixtureOnly);
  }
  if (where && !whereProvince) {
    const like = `%${where.replace(/[%_,()]/g, " ")}%`;
    query = query.or(`city.ilike.${like},location_text.ilike.${like}`);
  }
  const stateBy = new Map((states ?? []).map((s) => [s.job_id, s.status]));
  const savedIds = (states ?? []).filter((s) => s.status !== "dismissed").map((s) => s.job_id);
  const [fresh, excludedCount, ...savedParts] = await Promise.all([query, excludedQuery, ...chunk(savedIds.slice(0, 300), 100).map((ids) => supabase.from("jobs").select(JOB_FIELDS).in("id", ids))]);
  if (fresh.error || savedParts.some((p) => p.error)) return <LoadError what="postings" />;
  const savedJobs = savedParts.flatMap((p) => (p.data ?? []) as unknown as Row[]);

  // Where each posting came from (and a last guard: sample employers never show outside fixture mode).
  const all = [...(fresh.data as unknown as Row[]), ...savedJobs];
  const employerIds = [...new Set(all.map((j) => j.employer_id).filter((id): id is string => Boolean(id)))];
  const employerParts = await Promise.all(chunk(employerIds, 100).map((ids) => supabase.from("employers").select("id, name, ats, careers_url").in("id", ids)));
  const employerBy = new Map<string, EmployerInfo>(employerParts.flatMap((p) => (p.data ?? []).map((e) => [e.id, { name: e.name, ats: e.ats, careers_url: e.careers_url }] as const)));
  const real = (j: Row) => services.fixtures || ((!j.employer_id || employerBy.get(j.employer_id)?.ats !== "fixture") && (Boolean(j.user_id) || !isFixtureLink(j.apply_url)));

  const excludedWords = settings.job_exclude_keywords.map((k) => k.toLowerCase());
  const filtered = (fresh.data as unknown as Row[]).filter((j) => real(j) && stateBy.get(j.id) !== "dismissed" && !excludedWords.some((k) => j.title.toLowerCase().includes(k)) && matchesFilters(j, filters, currency));

  // 3. Freshness: the shortest window with enough verified results, unless the user chose one.
  const verifiedWithin = (r: Range) => filtered.filter((j) => j.verification_status === "verified" && j.posted_at >= rangeSince(r)).length;
  const { range, expandedFrom, firstCount } = chooseRange(verifiedWithin, explicitRange);
  const inWindow = filtered.filter((j) => j.posted_at >= rangeSince(range));

  // 4. One copy of each job, the most direct verified link first.
  const employerHosted = (j: Row) => {
    if (j.source !== "ats" || !j.apply_url || !j.employer_id) return false;
    try {
      return !/greenhouse|lever|ashbyhq|smartrecruiters|workable|recruitee/.test(new URL(j.apply_url).hostname);
    } catch {
      return false;
    }
  };
  const merged = dedupeJobs(inWindow.map((j) => ({ ...j, source: j.source as DedupeItem["source"], employerHosted: employerHosted(j) })));
  const duplicatesOf = new Map(merged.map((m) => [m.job.id, m.duplicates]));
  const rows = merged.map((m) => m.job as unknown as Row);

  // 5. Fit: saved checks, and the rest now (rules and database queries; no outside calls).
  const matchBy = new Map<string, { tier: TierKey; score: number; summary: string | null; results: unknown }>();
  const scoreIds = [...new Set([...rows, ...savedJobs].map((j) => j.id))];
  if (resume) {
    const parts = await Promise.all(chunk(scoreIds, 100).map((part) => supabase.from("job_matches").select("job_id, fit_score, tier, summary, requirement_results, updated_at").eq("resume_id", resume.id).in("job_id", part)));
    for (const m of parts.flatMap((p) => p.data ?? [])) if (Date.parse(m.updated_at) >= Date.parse(resume.updatedAt)) matchBy.set(m.job_id, { tier: m.tier, score: m.fit_score, summary: m.summary, results: m.requirement_results });
    const todo = scoreIds.filter((id) => !matchBy.has(id)).slice(0, MAX_SCORED_PER_VIEW);
    if (todo.length) {
      await scoreJobs(supabase, userId, resume, todo, services.embedder);
      const again = await Promise.all(chunk(todo, 100).map((part) => supabase.from("job_matches").select("job_id, fit_score, tier, summary, requirement_results").eq("resume_id", resume.id).in("job_id", part)));
      for (const m of again.flatMap((p) => p.data ?? [])) matchBy.set(m.job_id, { tier: m.tier, score: m.fit_score, summary: m.summary, results: m.requirement_results });
    }
  }

  // 6. Rank: fit, title, recency, location, source quality.
  const resumeSkills = resume ? resume.profile.skills.map((s) => s.toLowerCase()) : [];
  const ranked = rows
    .map((j) => {
      const m = matchBy.get(j.id);
      const pre = resume && !m ? prefilterScore({ title: j.title, description: j.description }, resumeSkills, resume.applicant.years) : null;
      return { j, score: rankScore(j, m ? { score: m.score, tier: m.tier } : null, pre, { searched: searched.length ? searched : settings.job_titles, provinces, country }) };
    })
    .sort((a, b) => b.score - a.score || b.j.posted_at.localeCompare(a.j.posted_at));

  const inTab: Record<Tab, Row[]> = {
    all: ranked.filter((x) => matchBy.get(x.j.id)?.tier !== "excluded").map((x) => x.j),
    fit: ranked.filter((x) => ["strong", "good"].includes(matchBy.get(x.j.id)?.tier ?? "")).map((x) => x.j),
    stretch: ranked.filter((x) => matchBy.get(x.j.id)?.tier === "stretch").map((x) => x.j),
    excluded: ranked.filter((x) => matchBy.get(x.j.id)?.tier === "excluded").map((x) => x.j),
    saved: savedJobs.filter(real),
  };
  const list = inTab[tab];
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const current = Math.min(page, pages);
  const shown = list.slice((current - 1) * PAGE, current * PAGE);
  const verifiedCount = inTab.all.filter((j) => j.verification_status === "verified").length;
  const trouble = providerTrouble(notices);
  const label = (searched[0] ?? "").trim();

  const href = (over: Record<string, string>) => {
    const s = new URLSearchParams();
    const level = over.level ?? (levelChosen ? filters.levels.join(",") : null);
    const keep = { q, where, country: askedCountry && country !== settings.job_country ? country : "", range: explicitRange?.key ?? "", tab, prov: whereProvince ? "" : provFilter.join(","), all: allTitles ? "1" : "", wp: filters.workplace.join(","), wpu: filters.includeUnknownWorkplace ? "1" : "", type: filters.types.join(","), pay: filters.hasSalary ? "1" : "", minpay: filters.minSalary ? String(filters.minSalary) : "", company: filters.company, src: filters.sources.join(","), unchecked: filters.includeUnchecked ? "1" : "", page: "", ...over };
    for (const [k, v] of Object.entries(keep)) if (k !== "level" && v && !(k === "tab" && v === "all") && !(k === "page" && v === "1")) s.set(k, v);
    // An empty "level" means "any level"; leaving it out means "my level from Settings".
    if (level !== null) s.set("level", level);
    return `/jobs${s.size ? `?${s}` : ""}`;
  };

  // What to announce once for this search (the same facts are shown on the page).
  const searchKey = `search:${[q, where, explicitRange?.key, tab, filters.workplace, filters.levels, filters.types, filters.hasSalary, filters.minSalary, filters.company, filters.sources, filters.includeUnchecked].join("|")}`;
  const toasts = [
    tab === "all"
      ? verifiedCount
        ? { key: `${searchKey}:count`, type: "success" as const, title: `${verifiedCount} verified ${label ? `${label} ` : ""}job${verifiedCount === 1 ? "" : "s"} found.${excludedCount.count ? ` ${excludedCount.count} unavailable listing${excludedCount.count === 1 ? " was" : "s were"} excluded.` : ""}` }
        : { key: `${searchKey}:count`, type: "info" as const, title: "No verified jobs were found." }
      : null,
    expandedFrom ? { key: `${searchKey}:expanded`, type: "info" as const, title: expansionNotice(firstCount, expandedFrom, range) } : null,
    trouble ? { key: `${searchKey}:trouble`, type: "warning" as const, title: "Some job sources are temporarily unavailable." } : null,
  ].filter((t): t is NonNullable<typeof t> => t !== null);

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
      <ToastOnMount specs={toasts} />
      {/* On phones the results come first and the filters follow; side by side from lg up. */}
      <aside className="order-last grid gap-4 lg:sticky lg:top-6 lg:order-none" aria-label="Filters and preferences">
        <FiltersPanel sp={sp} filters={filters} provinces={inCanada ? provinces : []} provFilter={provFilter} hrefBase={href} explicitRange={explicitRange} showAdzuna={registry.providers.some((p) => p.name === "adzuna")} showUsajobs={registry.providers.some((p) => p.name === "usajobs")} currency={currency} />
        <PreferencesCard settings={settings} />
        <div className="grid gap-1 px-1 text-xs text-muted-foreground">
          <p>
            Sources: {(employerCount ?? 0).toLocaleString("en-CA")} employers&apos; job boards ({lastRun?.finished_at ? `last read ${timeAgo(lastRun.finished_at)}` : "not read yet"}), remote jobs from Jobicy and Remotive, jobs in Europe and the UK from Arbeitnow
            {registry.providers.some((p) => p.name === "usajobs") ? ", U.S. federal jobs from USAJOBS" : ""}
            {registry.providers.some((p) => p.name === "adzuna") ? ", and Adzuna job search" : ""}.
          </p>
          <p>Jobicy and Remotive links go to their own listing pages, not the employer&apos;s. Remotive shares jobs 24 hours after it posts them.</p>
          <p>
            LinkedIn, Indeed, Glassdoor and Google Jobs aren&apos;t searched by the app: they don&apos;t offer a public job-search API. Search them yourself with the links under the search bar, then{" "}
            <Link href="/jobs/add" className="underline underline-offset-4">
              paste a posting
            </Link>{" "}
            to check it against your resume.
          </p>
          {services.limitations.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </aside>

      <section aria-labelledby="results-heading" className="grid min-w-0 gap-4">
        <form action="/jobs" className="grid gap-2 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-[minmax(0,1fr)_11rem_10rem_auto]" role="search" aria-label="Search jobs">
          <div className="grid gap-1">
            <Label htmlFor="q" className="sr-only">
              Job title or keywords
            </Label>
            <Input id="q" name="q" defaultValue={q} placeholder={settings.job_titles[0] ? `e.g. ${settings.job_titles[0]}` : "e.g. Full Stack Developer"} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="country" className="sr-only">
              Country
            </Label>
            <CountrySelect id="country" name="country" value={country} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="where" className="sr-only">
              City or region
            </Label>
            <Input id="where" name="where" defaultValue={where} placeholder={inCanada ? "City or province" : "City or region"} />
          </div>
          <Button type="submit">
            <Search aria-hidden /> Search
          </Button>
          {explicitRange ? <input type="hidden" name="range" value={explicitRange.key} /> : null}
        </form>
        <ExternalSearchRow what={searched[0] ?? ""} where={where || null} country={country} />

        {!resume ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-info-soft p-4">
            <div className="grid gap-0.5">
              <p className="font-medium">Start with your resume</p>
              <p className="text-sm text-muted-foreground">Import it to see how well each posting fits and why.</p>
            </div>
            <Link href="/jobs/resume" className={buttonVariants({ size: "sm" })}>
              Import resume
            </Link>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-0.5">
            <h2 id="results-heading" className="text-lg font-semibold">
              {label ? `${label} jobs` : "Jobs"} from {range.heading}
            </h2>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {list.length ? `Showing ${(current - 1) * PAGE + 1}–${Math.min(current * PAGE, list.length)} of ${list.length.toLocaleString("en-CA")} matching jobs` : "No matching jobs"} in{" "}
              {placeName}
              {where && !whereProvince ? ` near ${where}` : ""}
              {(fresh.data?.length ?? 0) >= MAX_ROWS ? ` · showing the newest ${MAX_ROWS.toLocaleString("en-CA")}` : ""}
            </p>
          </div>
          <nav aria-label="Posted within" className="inline-flex flex-wrap rounded-lg border bg-card p-0.5 shadow-xs">
            <Link href={href({ range: "", page: "" })} aria-current={!explicitRange ? "page" : undefined} className={cn("rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground", !explicitRange && "bg-primary text-primary-foreground hover:text-primary-foreground")}>
              Newest
            </Link>
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={href({ range: r.key, page: "" })}
                aria-current={explicitRange?.key === r.key ? "page" : undefined}
                className={cn("rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground", explicitRange?.key === r.key && "bg-primary text-primary-foreground hover:text-primary-foreground")}
              >
                {r.label}
              </Link>
            ))}
          </nav>
        </div>

        {expandedFrom || trouble || excludedCount.count || !filters.includeUnchecked || newlyFetched ? (
          <div className="grid gap-1 text-sm">
            {expandedFrom ? <p className="rounded-lg border border-info/30 bg-info-soft px-3 py-2">{expansionNotice(firstCount, expandedFrom, range)}</p> : null}
            {trouble ? <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2">Some job sources are temporarily unavailable. Results from the others are shown.</p> : null}
            {newlyFetched && !filters.includeUnchecked ? (
              <p className="rounded-lg border border-info/30 bg-info-soft px-3 py-2" role="status">
                {newlyFetched} new listing{newlyFetched === 1 ? " was" : "s were"} found and {newlyFetched === 1 ? "its link is" : "their links are"} being checked now. Reload in a minute to see the ones that check out.
              </p>
            ) : null}
            {excludedCount.count ? (
              <p className="text-muted-foreground">
                {excludedCount.count} listing{excludedCount.count === 1 ? " was" : "s were"} left out because {excludedCount.count === 1 ? "its" : "their"} link expired, broke or failed verification.
              </p>
            ) : null}
            {!filters.includeUnchecked ? (
              <p className="text-muted-foreground">
                Only verified listings are shown.{" "}
                <Link href={href({ unchecked: "1", page: "" })} className="underline underline-offset-4">
                  Include listings not yet verified
                </Link>{" "}
                (you can view them, but Apply stays off until their link is confirmed).
              </p>
            ) : null}
          </div>
        ) : null}

        <nav aria-label="Fit" className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Link
                key={t.key}
                href={href({ tab: t.key, page: "" })}
                aria-current={active ? "page" : undefined}
                className={cn("inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40", active && "border-primary bg-accent font-medium text-accent-foreground")}
              >
                <span aria-hidden className={cn("size-2 rounded-full", TIER_STYLE[t.tier].dot)} />
                {t.label}
                <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">({inTab[t.key].length})</span>
              </Link>
            );
          })}
        </nav>

        {shown.length === 0 ? (
          <EmptyState tab={tab} hasResume={Boolean(resume)} href={href} searched={searched} explicitRange={explicitRange} filtered={activeFilterCount(filters) > 0} where={where} />
        ) : (
          <ul className="grid gap-2">
            {shown.map((j) => {
              const m = matchBy.get(j.id);
              const fit = m ? StoredFit.safeParse(m.results) : null;
              const employer = j.employer_id ? employerBy.get(j.employer_id) : null;
              const twins = duplicatesOf.get(j.id) ?? [];
              return (
                <JobCard
                  key={j.id}
                  job={j}
                  fit={m ? { tier: m.tier, score: m.score, summary: m.summary } : null}
                  explanation={fit?.success ? explainFit(fit.data.requirements, fit.data.results, (t) => skillsIn(t).map((s) => s.name)) : null}
                  skills={skillsIn(`${j.title}\n${j.description}`).map((s) => s.name)}
                  status={(stateBy.get(j.id) as "saved" | "applied" | "dismissed" | undefined) ?? null}
                  source={jobSource(j, employer)}
                  alsoOn={[...new Set(twins.map((t) => alsoListedOn(t.source)))]}
                />
              );
            })}
          </ul>
        )}

        {pages > 1 ? (
          <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-1 text-sm">
            {current > 1 ? (
              <Link href={href({ page: String(current - 1) })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                ← Previous
              </Link>
            ) : null}
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === pages || Math.abs(n - current) <= 2)
              .map((n, i, arr) => (
                <span key={n} className="flex items-center gap-1">
                  {i > 0 && n - arr[i - 1] > 1 ? <span className="px-1 text-muted-foreground">…</span> : null}
                  <Link href={href({ page: String(n) })} aria-current={n === current ? "page" : undefined} className={buttonVariants({ variant: n === current ? "default" : "ghost", size: "sm" })}>
                    {n}
                  </Link>
                </span>
              ))}
            {current < pages ? (
              <Link href={href({ page: String(current + 1) })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Next →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}

function EmptyState({
  tab,
  hasResume,
  href,
  searched,
  explicitRange,
  filtered,
  where,
}: {
  tab: Tab;
  hasResume: boolean;
  href: (over: Record<string, string>) => string;
  searched: string[];
  explicitRange: Range | null;
  filtered: boolean;
  where: string;
}) {
  if (tab === "saved") return <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Nothing saved yet.</p>;
  if (tab !== "all" && !hasResume) return <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Import your resume to sort jobs by fit.</p>;
  const related = searched[0] ? [...relatedTitles(searched[0]).related, ...relatedTitles(searched[0]).broader].slice(0, 2) : [];
  const actions = [
    explicitRange?.key !== "30d" ? { label: "Expand the date range to 30 days", href: href({ range: "30d", page: "" }) } : null,
    where ? { label: "Search all of my provinces", href: href({ where: "", page: "" }) } : { label: "Change location in your preferences", href: "#preferences" },
    filtered ? { label: "Remove filters", href: href({ wp: "", wpu: "", level: "", type: "", pay: "", minpay: "", company: "", src: "", page: "" }) } : null,
    ...related.map((t) => ({ label: `Try “${t}”`, href: href({ q: t, page: "" }) })),
  ].filter((a): a is { label: string; href: string } => a !== null);
  return (
    <div className="grid gap-3 rounded-xl border border-dashed bg-card p-8 text-center">
      <p className="font-medium">No verified jobs found.</p>
      <p className="text-sm text-muted-foreground">We only show real postings whose links check out, so there may be fewer results than on other sites. Try one of these:</p>
      <ul className="flex flex-wrap justify-center gap-2">
        {actions.map((a) => (
          <li key={a.label}>
            <Link href={a.href} className={buttonVariants({ size: "sm", variant: "outline" })}>
              {a.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FiltersPanel({
  sp,
  filters,
  provinces,
  provFilter,
  hrefBase,
  explicitRange,
  showAdzuna,
  showUsajobs,
  currency,
}: {
  sp: Record<string, string>;
  filters: Filters;
  provinces: string[];
  provFilter: string[];
  hrefBase: (over: Record<string, string>) => string;
  explicitRange: Range | null;
  /** Adzuna and USAJOBS are optional: their filters show only when they're configured. */
  showAdzuna: boolean;
  showUsajobs: boolean;
  /** The searched country's currency; the minimum-pay filter compares only pay stated in it. */
  currency: string | null;
}) {
  const checked = (list: string[], v: string) => list.includes(v);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" /> Filters
          {activeFilterCount(filters) ? <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeFilterCount(filters)}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {provinces.length ? (
        <div className="grid gap-1.5" role="group" aria-label="Province">
          <p className="text-xs font-medium text-muted-foreground">Province</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip href={hrefBase({ prov: "", where: "", page: "" })} active={!provFilter.length} label="All mine" />
            {provinces.map((p) => (
              <Chip key={p} href={hrefBase({ prov: p, where: "", page: "" })} active={provFilter.length === 1 && provFilter[0] === p} label={p} title={PROVINCE_NAMES[p as ProvinceCode]} />
            ))}
          </div>
        </div>
        ) : null}
        {/* A plain GET form: works without JavaScript and keeps the search in the URL. */}
        <form action="/jobs" className="grid gap-3 text-sm">
          {["q", "where", "country", "prov", "tab", "all"].map((k) => (sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null))}
          {/* Sent even when no level is ticked, so "no level filter" is different from "my default level". */}
          <input type="hidden" name="level" value="" />
          {explicitRange ? <input type="hidden" name="range" value={explicitRange.key} /> : null}
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Workplace</legend>
            {(Object.keys(WORKPLACE_LABELS) as (keyof typeof WORKPLACE_LABELS)[]).map((w) => (
              <label key={w} className="flex items-center gap-2">
                <input type="checkbox" name="wp" value={w} defaultChecked={checked(filters.workplace, w)} className="size-4 accent-primary" /> {WORKPLACE_LABELS[w]}
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="wpu" value="1" defaultChecked={filters.includeUnknownWorkplace} className="size-3.5 accent-primary" /> Include jobs that don&apos;t say
            </label>
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Level</legend>
            {LEVELS.map((l) => (
              <label key={l} className="flex items-center gap-2">
                <input type="checkbox" name="level" value={l} defaultChecked={checked(filters.levels, l)} className="size-4 accent-primary" /> {LEVEL_LABELS[l]}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              Read from the source, or from the job title. Until you choose, your level from Settings is used and jobs that don&apos;t state a level still show; once you choose, only jobs at those levels do.
            </p>
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Employment type</legend>
            {(
              [
                ["full", "Full-time"],
                ["part", "Part-time"],
                ["contract", "Contract"],
                ["internship", "Internship / co-op"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2">
                <input type="checkbox" name="type" value={v} defaultChecked={checked(filters.types, v)} className="size-4 accent-primary" /> {l}
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Salary</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="pay" value="1" defaultChecked={filters.hasSalary} className="size-4 accent-primary" /> Salary stated
            </label>
            {currency ? (
              <>
                <Label htmlFor="minpay" className="text-xs">
                  At least (per year, {currency})
                </Label>
                <Input id="minpay" name="minpay" type="number" min={0} step={5000} defaultValue={filters.minSalary ?? ""} placeholder="70000" />
                <p className="text-xs text-muted-foreground">Only pay stated in {currency} is compared; nothing is converted.</p>
              </>
            ) : null}
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="company" className="text-xs">
              Company
            </Label>
            <Input id="company" name="company" defaultValue={filters.company} />
          </div>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Source</legend>
            {(
              [
                ["ats", "Employer job boards"],
                ["jobicy", "Jobicy"],
                ["remotive", "Remotive"],
                ["arbeitnow", "Arbeitnow"],
                ...(showUsajobs ? ([["usajobs", "USAJOBS"]] as const) : []),
                ...(showAdzuna ? ([["adzuna", "Adzuna"]] as const) : []),
                ["manual", "Pasted by me"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2">
                <input type="checkbox" name="src" value={v} defaultChecked={checked(filters.sources, v)} className="size-4 accent-primary" /> {l}
              </label>
            ))}
          </fieldset>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="unchecked" value="1" defaultChecked={filters.includeUnchecked} className="mt-0.5 size-4 accent-primary" />
            <span>
              Include listings not yet verified <span className="block text-xs text-muted-foreground">Apply stays off until their link is confirmed.</span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">There&apos;s no visa sponsorship filter: no source states it reliably.</p>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Apply filters
            </Button>
            <Link href={hrefBase({ wp: "", wpu: "", level: "", type: "", pay: "", minpay: "", company: "", src: "", unchecked: "", page: "" })} className={buttonVariants({ size: "sm", variant: "ghost" })}>
              Clear
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PreferencesCard({ settings }: { settings: { job_titles: string[]; job_country: string; job_provinces: string[]; job_seniority: string; job_exclude_keywords: string[] } }) {
  return (
    <Card size="sm" id="preferences">
      <CardHeader>
        <CardTitle className="text-sm">Search preferences</CardTitle>
        <CardDescription className="text-xs">{settings.job_titles.length ? `Default search: ${settings.job_titles.join(", ")}.` : "No titles set: searches show every job."}</CardDescription>
      </CardHeader>
      <CardContent>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-primary">Edit preferences</summary>
          <ActionForm action={saveJobPreferences} submitLabel="Save preferences" size="sm" className="mt-3">
            <div className="grid gap-1.5">
              <Label htmlFor="titles">Job titles (one per line, up to 6)</Label>
              <Textarea id="titles" name="titles" rows={3} defaultValue={settings.job_titles.join("\n")} placeholder={"Junior Software Developer\nQA Analyst"} />
              <p className="text-xs text-muted-foreground">&ldquo;Developer&rdquo; also finds Engineer and Programmer roles, &ldquo;Designer&rdquo; finds UX and Product Designer, and so on. Level words like &ldquo;Junior&rdquo; aren&apos;t required in titles: the level filter handles them.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pref-country">Country</Label>
              <CountrySelect id="pref-country" name="country" value={settings.job_country} />
              <p className="text-xs text-muted-foreground">Searches show jobs there, and remote jobs open to it.</p>
            </div>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-sm font-medium">Provinces (when searching Canada)</legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {PROVINCE_CODES.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-sm" title={PROVINCE_NAMES[p]}>
                    <input type="checkbox" name="provinces" value={p} defaultChecked={settings.job_provinces.includes(p)} className="size-4 accent-primary" />
                    {PROVINCE_NAMES[p]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-1.5">
              <Label htmlFor="seniority">Your level (the default level filter)</Label>
              <NativeSelect id="seniority" name="seniority" defaultValue={settings.job_seniority}>
                {SENIORITY.map((s) => (
                  <option key={s} value={s}>
                    {SENIORITY_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="exclude">Leave out titles with</Label>
              <Input id="exclude" name="exclude" defaultValue={settings.job_exclude_keywords.join(", ")} placeholder="Senior, Manager" />
            </div>
          </ActionForm>
        </details>
      </CardContent>
    </Card>
  );
}

/** The same search on sites the app can't read, opened by the user in a new tab. */
function ExternalSearchRow({ what, where, country }: { what: string; where: string | null; country: string }) {
  const links = externalSearchLinks({ what, where, country });
  if (!links.length) return null;
  return (
    <nav aria-label="Search other job sites" className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
      <span>Also search “{what}” on:</span>
      {links.map((l) => (
        <a key={l.site} href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
          {l.label}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ))}
      <span>
        · Found one?{" "}
        <Link href="/jobs/add" className="underline underline-offset-4">
          Paste it here
        </Link>
      </span>
    </nav>
  );
}

/** One country at a time, or remote jobs open anywhere. */
function CountrySelect({ id, name, value }: { id: string; name: string; value: string }) {
  return (
    <NativeSelect id={id} name={name} defaultValue={value}>
      <option value={ANYWHERE}>Anywhere (remote)</option>
      {countryOptions().map((c) => (
        <option key={c.code} value={c.code}>
          {c.name}
        </option>
      ))}
    </NativeSelect>
  );
}

function Chip({ href, active, label, title }: { href: string; active: boolean; label: string; title?: string }) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? "true" : undefined}
      className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:border-primary/50", active && "border-primary bg-primary text-primary-foreground")}
    >
      {label}
    </Link>
  );
}
