import { Suspense } from "react";
import { PageNav } from "@/components/page-nav";
import { FiltersToggle } from "@/components/jobs/filters-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState as EmptyPanel } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Disclosure } from "@/components/disclosure";
import { Checkbox } from "@/components/ui/checkbox";
import { headers } from "next/headers";
import { after } from "next/server";
import Link from "next/link";
import { Bookmark, FileText, Info, Plus, Search, SearchX, SlidersHorizontal, TriangleAlert } from "lucide-react";
import type { TierKey } from "@/components/jobs/job-visuals";
import { TIER_STYLE } from "@/components/jobs/job-visuals";
import { JobCard } from "@/components/jobs/job-card";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { AppSelect } from "@/components/app-select";
import { PageHeader } from "@/components/page-header";
import { ToastOnMount } from "@/components/toast/toast-on-mount";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { expansionNotice, RANGES, relatedTitles, type Range } from "@/lib/job-postings/feed";
import { activeFilterCount, type Filters } from "@/lib/job-postings/filters";
import { explainFit } from "@/lib/job-postings/fit";
import { timeAgo } from "@/lib/job-postings/labels";
import { LEVEL_LABELS, LEVELS, WORKPLACE_LABELS } from "@/lib/job-postings/levels";
import { StoredFit } from "@/lib/job-postings/schemas";
import { providerTrouble } from "@/lib/job-postings/search";
import { jobServices } from "@/lib/job-postings/services";
import { alsoListedOn, jobSource } from "@/lib/job-postings/source";
import { externalSearchLinks } from "@/lib/job-postings/external-search";
import { skillsIn } from "@/lib/job-postings/taxonomy";
import { ANYWHERE, countryOptions } from "@/lib/geo/countries";
import { PROVINCE_CODES, PROVINCE_NAMES, type ProvinceCode } from "@/lib/job-postings/types";
import { createClient } from "@/lib/supabase/server";
import { describeSearch, fromSearchParams, searchOnly } from "@/lib/job-postings/feed-query";
import { emailConfigured } from "@/lib/email/mailer";
import { SaveSearch } from "@/components/alerts/save-search";
import { FEED_PAGE_SIZE, loadFeed, MAX_FEED_ROWS } from "@/lib/job-postings/feed-service";
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
const PAGE = FEED_PAGE_SIZE;

export default function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Jobs"
        description="Real, recent postings, each checked against your resume. Every listing shows where it came from."
        actions={
          <>
            <Link href="/jobs/hidden" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Hidden
            </Link>
            <Link href="/jobs/resume" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileText aria-hidden /> Resume
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
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}

/** The person searching, as some job sources require (Careerjet): their IP and browser. */
async function searchingClient(): Promise<{ ip: string; userAgent: string } | null> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  const userAgent = h.get("user-agent")?.slice(0, 500) ?? "";
  return ip && userAgent ? { ip, userAgent } : null;
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
  if (!userId) return <LoadError what="postings" />;

  const query = fromSearchParams(raw);
  const [feed, { data: lastRun }, { count: employerCount }, { data: me }] = await Promise.all([
    loadFeed(supabase, userId, query, { refresh: true, client: await searchingClient(), background: (work) => after(work) }),
    supabase.from("job_crawl_runs").select("finished_at").not("finished_at", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("employers").select("id", { count: "exact", head: true }).neq("status", "disabled").neq("ats", "fixture"),
    supabase.from("settings").select("timezone").eq("user_id", userId).single(),
  ]);
  if ("error" in feed) return <LoadError what="postings" />;

  const { settings, resume, notices, newlyFetched, range, expandedFrom, firstCount, duplicatesOf, matches: matchBy, states: stateBy, employers: employerBy, excludedCount, tabs: inTab } = feed;
  const { q, where, allTitles, searched, explicitRange, levelChosen, filters, tab, page, askedCountry, country, inCanada, currency, provinces, whereProvince, provFilter, placeName } = feed.resolved;
  const providerNames = feed.providers;

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
        ? { key: `${searchKey}:count`, type: "success" as const, title: `${verifiedCount} verified ${label ? `${label} ` : ""}job${verifiedCount === 1 ? "" : "s"} found.${excludedCount ? ` ${excludedCount} unavailable listing${excludedCount === 1 ? " was" : "s were"} excluded.` : ""}` }
        : { key: `${searchKey}:count`, type: "info" as const, title: "No verified jobs were found." }
      : null,
    expandedFrom ? { key: `${searchKey}:expanded`, type: "info" as const, title: expansionNotice(firstCount, expandedFrom, range) } : null,
    trouble ? { key: `${searchKey}:trouble`, type: "warning" as const, title: "Some job sources are temporarily unavailable." } : null,
  ].filter((t): t is NonNullable<typeof t> => t !== null);

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:[grid-template-areas:'filters_search''filters_results']">
      <ToastOnMount specs={toasts} />
      <div className="grid gap-4 lg:[grid-area:search]">
        <form action="/jobs" className="grid gap-2 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_10rem_9rem_auto]" role="search" aria-label="Search jobs" data-tour="jobs-search">
          <div className="grid gap-1 sm:col-span-2 2xl:col-span-1">
            <Label htmlFor="q" className="sr-only">
              Job title or keywords
            </Label>
            <Input id="q" name="q" defaultValue={q} placeholder={settings.job_titles[0] ? `e.g. ${settings.job_titles[0]}` : "A job title, e.g. one you're aiming for"} />
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
          <Button type="submit" className="sm:col-span-2 2xl:col-span-1">
            <Search aria-hidden /> Search
          </Button>
          {explicitRange ? <input type="hidden" name="range" value={explicitRange.key} /> : null}
        </form>
        <div className="grid gap-2">
        <ExternalSearchRow what={searched[0] ?? ""} where={where || null} country={country} />
        <SaveSearch params={searchOnly(query).params as Record<string, string>} suggestedName={describeSearch(query, settings)} emailAvailable={emailConfigured()} timeZone={me?.timezone ?? "UTC"} />
        </div>
      </div>

      {/* A button under the search box on phones; a sidebar beside the results from lg up. */}
      <FiltersToggle count={activeFilterCount(filters)} className="lg:sticky lg:top-20 lg:[grid-area:filters]">
      <aside className="grid gap-4" aria-label="Filters and preferences">
        <FiltersPanel sp={sp} filters={filters} provinces={inCanada ? provinces : []} provFilter={provFilter} hrefBase={href} explicitRange={explicitRange} showAdzuna={providerNames.includes("adzuna")} showUsajobs={providerNames.includes("usajobs")} showCareerjet={providerNames.includes("careerjet")} currency={currency} />
        <PreferencesCard settings={settings} resumeTitles={feed.resolved.titlesFromResume ? searched : []} />
        <Disclosure variant="plain" summary="About these results" className="px-1 text-xs">
          <div className="grid gap-1.5">
            <p>
              Sources: {(employerCount ?? 0).toLocaleString("en-CA")} employers&apos; job boards ({lastRun?.finished_at ? `last read ${timeAgo(lastRun.finished_at)}` : "not read yet"}), remote jobs from Jobicy and Remotive, jobs in Europe and the UK from Arbeitnow
              {providerNames.includes("usajobs") ? ", U.S. federal jobs from USAJOBS" : ""}
              {providerNames.includes("careerjet") ? ", Careerjet job search" : ""}
              {providerNames.includes("adzuna") ? ", and Adzuna job search" : ""}.{" "}
              <Link href="/jobs/employers" className="underline underline-offset-4">
                See the employers
              </Link>
              .
            </p>
            <p>Jobicy and Remotive links go to their own listing pages, not the employer&apos;s. Remotive shares jobs 24 hours after it posts them.</p>
            <p>
              LinkedIn, Indeed, Glassdoor and Google Jobs aren&apos;t searched by the app: they don&apos;t offer a public job-search API. Search them yourself with the links under the search bar, then{" "}
              <Link href="/jobs/add" className="underline underline-offset-4">
                paste a posting
              </Link>{" "}
              to check it against your resume.
            </p>
          </div>
        </Disclosure>
        {services.limitations.map((l) => (
          <p key={l} className="px-1 text-xs text-muted-foreground">
            {l}
          </p>
        ))}
      </aside>
      </FiltersToggle>

      <section aria-labelledby="results-heading" className="grid min-w-0 gap-4 lg:[grid-area:results]">

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
              {feed.loadedRows >= MAX_FEED_ROWS ? ` · showing the newest ${MAX_FEED_ROWS.toLocaleString("en-CA")}` : ""}
            </p>
          </div>
        </div>

        {expandedFrom || trouble || excludedCount || !filters.includeUnchecked || newlyFetched ? (
          <div className="grid gap-1 text-sm">
            {expandedFrom ? (
              <Alert variant="info" role="status">
                <Info aria-hidden />
                <AlertDescription>{expansionNotice(firstCount, expandedFrom, range)}</AlertDescription>
              </Alert>
            ) : null}
            {trouble ? (
              <Alert variant="warning" role="status">
                <TriangleAlert aria-hidden />
                <AlertDescription>Some job sources are temporarily unavailable. Results from the others are shown.</AlertDescription>
              </Alert>
            ) : null}
            {newlyFetched && !filters.includeUnchecked ? (
              <Alert variant="info" role="status">
                <Info aria-hidden />
                <AlertDescription>
                {newlyFetched} new listing{newlyFetched === 1 ? " was" : "s were"} found and {newlyFetched === 1 ? "its link is" : "their links are"} being checked now. Reload in a minute to see the ones that check out.
              </AlertDescription>
              </Alert>
            ) : null}
            <p className="text-muted-foreground">
              {!filters.includeUnchecked ? "Only verified listings are shown. " : ""}
              {excludedCount ? `${excludedCount} listing${excludedCount === 1 ? " was" : "s were"} left out because ${excludedCount === 1 ? "its" : "their"} link expired, broke or failed verification. ` : ""}
              {!filters.includeUnchecked ? (
                <Link href={href({ unchecked: "1", page: "" })} className="underline underline-offset-4">
                  Include listings not yet verified
                </Link>
              ) : null}
            </p>
          </div>
        ) : null}

        <nav aria-label="Fit" data-tour="jobs-tabs" className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Link
                key={t.key}
                href={href({ tab: t.key, page: "" })}
                aria-current={active ? "page" : undefined}
                className={cn("inline-flex shrink-0 items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40", active && "border-primary bg-accent font-medium text-accent-foreground")}
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
                  fit={m ? { tier: m.tier as TierKey, score: m.score, summary: m.summary } : null}
                  explanation={fit?.success ? explainFit(fit.data.requirements, fit.data.results, (t) => skillsIn(t).map((s) => s.name)) : null}
                  skills={skillsIn(`${j.title}\n${j.description}`).map((s) => s.name)}
                  status={stateBy.get(j.id) ?? null}
                  source={jobSource(j, employer)}
                  alsoOn={[...new Set(twins.map((t) => alsoListedOn(t.source)))]}
                />
              );
            })}
          </ul>
        )}

        <PageNav current={current} pages={pages} href={(n) => href({ page: String(n) })} />
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
  if (tab === "saved") return <EmptyPanel icon={<Bookmark aria-hidden />} title="Nothing saved yet" description="Save a job from its card and it will be kept here." />;
  if (tab !== "all" && !hasResume) return <EmptyPanel icon={<FileText aria-hidden />} title="Import your resume to sort jobs by fit" description="Jobs are scored against your resume, so this is the quickest way to see good matches." />;
  const related = searched[0] ? [...relatedTitles(searched[0]).related, ...relatedTitles(searched[0]).broader].slice(0, 2) : [];
  const actions = [
    explicitRange?.key !== "30d" ? { label: "Expand the date range to 30 days", href: href({ range: "30d", page: "" }) } : null,
    where ? { label: "Search all of my provinces", href: href({ where: "", page: "" }) } : { label: "Change location in your preferences", href: "#preferences" },
    filtered ? { label: "Remove filters", href: href({ wp: "", wpu: "", level: "", type: "", pay: "", minpay: "", company: "", src: "", page: "" }) } : null,
    ...related.map((t) => ({ label: `Try “${t}”`, href: href({ q: t, page: "" }) })),
  ].filter((a): a is { label: string; href: string } => a !== null);
  return (
    <EmptyPanel
      icon={<SearchX aria-hidden />}
      title="No verified jobs found"
      description="We only show real postings whose links check out, so there may be fewer results than on other sites. Try one of these:"
    >
      <ul className="flex flex-wrap justify-center gap-2">
        {actions.map((a) => (
          <li key={a.label}>
            <Link href={a.href} className={buttonVariants({ size: "sm", variant: "outline" })}>
              {a.label}
            </Link>
          </li>
        ))}
      </ul>
    </EmptyPanel>
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
  showCareerjet,
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
  showCareerjet: boolean;
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
        <div className="grid gap-1.5" role="group" aria-label="Posted within">
          <p className="text-xs font-medium text-muted-foreground">Posted</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip href={hrefBase({ range: "", page: "" })} active={!explicitRange} label="Best match" />
            {RANGES.map((r) => (
              <Chip key={r.key} href={hrefBase({ range: r.key, page: "" })} active={explicitRange?.key === r.key} label={r.label} />
            ))}
          </div>
        </div>
        {/* A plain GET form: works without JavaScript and keeps the search in the URL. */}
        <form action="/jobs" className="grid gap-3 text-sm">
          {["q", "where", "country", "prov", "tab", "all"].map((k) => (sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null))}
          {/* Sent even when no level is ticked, so "no level filter" is different from "my default level". */}
          <input type="hidden" name="level" value="" />
          {explicitRange ? <input type="hidden" name="range" value={explicitRange.key} /> : null}
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Workplace</legend>
            {(Object.keys(WORKPLACE_LABELS) as (keyof typeof WORKPLACE_LABELS)[]).map((w) => (
              <label key={w} className="flex min-h-7 items-center gap-2">
                <Checkbox name="wp" value={w} defaultChecked={checked(filters.workplace, w)} /> {WORKPLACE_LABELS[w]}
              </label>
            ))}
            <label className="flex min-h-7 items-center gap-2 text-xs text-muted-foreground">
              <Checkbox name="wpu" value="1" defaultChecked={filters.includeUnknownWorkplace} /> Include jobs that don&apos;t say
            </label>
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Level</legend>
            {LEVELS.map((l) => (
              <label key={l} className="flex min-h-7 items-center gap-2">
                <Checkbox name="level" value={l} defaultChecked={checked(filters.levels, l)} /> {LEVEL_LABELS[l]}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">Until you choose, your level from Settings is used.</p>
          </fieldset>
          <Disclosure
            data-testid="more-filters"
            summary={
              <>
                More filters <span className="font-normal text-muted-foreground">(type, salary, company, source)</span>
              </>
            }
          >
            <div className="grid gap-3">
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
              <label key={v} className="flex min-h-7 items-center gap-2">
                <Checkbox name="type" value={v} defaultChecked={checked(filters.types, v)} /> {l}
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Salary</legend>
            <label className="flex min-h-7 items-center gap-2">
              <Checkbox name="pay" value="1" defaultChecked={filters.hasSalary} /> Salary stated
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
                ...(showCareerjet ? ([["careerjet", "Careerjet"]] as const) : []),
                ["manual", "Pasted by me"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="flex min-h-7 items-center gap-2">
                <Checkbox name="src" value={v} defaultChecked={checked(filters.sources, v)} /> {l}
              </label>
            ))}
          </fieldset>
          <label className="flex min-h-7 items-start gap-2">
            <Checkbox name="unchecked" value="1" defaultChecked={filters.includeUnchecked} className="mt-0.5" />
            <span>
              Include listings not yet verified <span className="block text-xs text-muted-foreground">Apply stays off until their link is confirmed.</span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">There&apos;s no visa sponsorship filter: no source states it reliably.</p>
            </div>
          </Disclosure>
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

function PreferencesCard({ settings, resumeTitles }: { settings: { job_titles: string[]; job_country: string; job_provinces: string[]; job_exclude_keywords: string[] }; resumeTitles: string[] }) {
  return (
    <Card size="sm" id="preferences">
      <CardContent>
        <details>
          <summary className="cursor-pointer rounded-md text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            Search preferences
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              {settings.job_titles.length
                ? `Default search: ${settings.job_titles.join(", ")}.`
                : resumeTitles.length
                  ? `No titles set, so searches use the roles in your resume: ${resumeTitles.join(", ")}.`
                  : "No titles set: searches show every job."}
            </span>
          </summary>
          <ActionForm action={saveJobPreferences} submitLabel="Save preferences" size="sm" className="mt-3">
            <div className="grid gap-1.5">
              <Label htmlFor="titles">Job titles (one per line, up to 6)</Label>
              <Textarea id="titles" name="titles" rows={3} defaultValue={settings.job_titles.join("\n")} placeholder={"One job title per line"} />
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
                  <label key={p} className="flex min-h-7 items-center gap-1.5 text-sm" title={PROVINCE_NAMES[p]}>
                    <Checkbox name="provinces" value={p} defaultChecked={settings.job_provinces.includes(p)} />
                    {PROVINCE_NAMES[p]}
                  </label>
                ))}
              </div>
            </fieldset>
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
    <nav aria-label="Search other job sites" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
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
    <AppSelect id={id} name={name} defaultValue={value}>
      <option value={ANYWHERE}>Anywhere (remote)</option>
      {countryOptions().map((c) => (
        <option key={c.code} value={c.code}>
          {c.name}
        </option>
      ))}
    </AppSelect>
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
