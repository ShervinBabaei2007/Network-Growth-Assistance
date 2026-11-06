import { Suspense } from "react";
import { PageNav } from "@/components/page-nav";
import { FiltersToggle } from "@/components/jobs/filters-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState as EmptyPanel } from "@/components/empty-state";
import { type SavedView } from "@/components/views-menu";
import { SavedViews } from "@/components/saved-views";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Disclosure } from "@/components/disclosure";
import { Checkbox } from "@/components/ui/checkbox";
import { headers } from "next/headers";
import { after } from "next/server";
import Link from "next/link";
import { Bookmark, FileText, Info, Plus, Search, SearchX, SlidersHorizontal, TriangleAlert } from "lucide-react";
import type { TierKey } from "@/components/jobs/job-visuals";
import { TIER_STYLE } from "@/components/jobs/job-visuals";
import { CompareBar } from "@/components/jobs/compare-select";
import { JobCard } from "@/components/jobs/job-card";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { AppSelect } from "@/components/app-select";
import { PageHeaderT, Tx } from "@/components/tx";
import { LocaleScope } from "@/components/locale-scope";
import { formatters, type MessageKey, type Translator } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { ToastOnMount } from "@/components/toast/toast-on-mount";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { expansionNotice, RANGES, relatedTitles, type Range } from "@/lib/job-postings/feed";
import { activeFilterCount, type Filters } from "@/lib/job-postings/filters";
import { fitBreakdown, payBar } from "@/lib/job-postings/fit-breakdown";
import { explainFit } from "@/lib/job-postings/fit";
import { timeAgo } from "@/lib/job-postings/labels";
import { LEVELS, WORKPLACE_LABELS } from "@/lib/job-postings/levels";
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
  { key: "all", label: "jobsPage.tabAll", tier: "unchecked" },
  { key: "fit", label: "jobsPage.tabFit", tier: "strong" },
  { key: "stretch", label: "jobsPage.tabStretch", tier: "stretch" },
  { key: "excluded", label: "jobsPage.tabExcluded", tier: "excluded" },
  { key: "saved", label: "jobsPage.tabSaved", tier: "good" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const PAGE = FEED_PAGE_SIZE;

export default function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <div className="grid gap-6">
      <PageHeaderT
        title="pages.jobs.title"
        description="pages.jobs.description"
        actions={
          <>
            <Link href="/jobs/hidden" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <Tx k="jobsPage.hidden" />
            </Link>
            <Link href="/jobs/resume" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileText aria-hidden /> <Tx k="jobsPage.resume" />
            </Link>
            <Link href="/jobs/add" className={buttonVariants({ size: "sm" })}>
              <Plus aria-hidden /> <Tx k="jobsPage.paste" />
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
        <Search aria-hidden className="size-4 animate-pulse" /> <Tx k="jobsPage.searching" />
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
  const [feed, { data: lastRun }, { count: employerCount }, { data: me }, { data: viewRows }] = await Promise.all([
    loadFeed(supabase, userId, query, { refresh: true, client: await searchingClient(), background: (work) => after(work) }),
    supabase.from("job_crawl_runs").select("finished_at").not("finished_at", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("employers").select("id", { count: "exact", head: true }).neq("status", "disabled").neq("ats", "fixture"),
    supabase.from("settings").select("timezone").eq("user_id", userId).single(),
    supabase.from("saved_views").select("id, name, query").eq("page", "jobs").order("created_at"),
  ]);
  const views: SavedView[] = viewRows ?? [];
  if ("error" in feed) return <LoadError what="postings" />;

  const { settings, resume, notices, newlyFetched, range, expandedFrom, firstCount, duplicatesOf, matches: matchBy, states: stateBy, employers: employerBy, excludedCount, tabs: inTab } = feed;
  const { q, where, allTitles, searched, explicitRange, levelChosen, filters, tab, page, askedCountry, country, inCanada, currency, provinces, whereProvince, provFilter, placeName } = feed.resolved;
  const providerNames = feed.providers;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const num = (n: number) => formatters(locale).number(n);

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
        ? { key: `${searchKey}:count`, type: "success" as const, title: `${t(verifiedCount === 1 ? "jobsPage.toastFoundOne" : "jobsPage.toastFoundMany", { count: verifiedCount, label: label ? `${label} ` : "" })}${excludedCount ? ` ${t(excludedCount === 1 ? "jobsPage.leftOutOne" : "jobsPage.leftOutMany", { count: excludedCount }).trim()}` : ""}` }
        : { key: `${searchKey}:count`, type: "info" as const, title: t("jobsPage.toastNone") }
      : null,
    expandedFrom ? { key: `${searchKey}:expanded`, type: "info" as const, title: expansionNotice(firstCount, expandedFrom, range) } : null,
    trouble ? { key: `${searchKey}:trouble`, type: "warning" as const, title: t("jobsPage.sourcesUnavailable").split(".")[0] + "." } : null,
  ].filter((t): t is NonNullable<typeof t> => t !== null);

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:[grid-template-areas:'filters_search''filters_results']">
      <ToastOnMount specs={toasts} />
      <div className="grid gap-4 lg:[grid-area:search]">
        <form action="/jobs" className="grid gap-2 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_10rem_9rem_auto]" role="search" aria-label={t("jobsPage.searchJobs")} data-tour="jobs-search">
          <div className="grid gap-1 sm:col-span-2 2xl:col-span-1">
            <Label htmlFor="q" className="sr-only">
              {t("jobsPage.titleOrKeywords")}
            </Label>
            <Input id="q" name="q" defaultValue={q} placeholder={settings.job_titles[0] ? t("jobsPage.titlePlaceholderExample", { title: settings.job_titles[0] }) : t("jobsPage.titlePlaceholder")} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="country" className="sr-only">
              {t("jobsPage.country")}
            </Label>
            <CountrySelect t={t} id="country" name="country" value={country} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="where" className="sr-only">
              {t("jobsPage.cityOrRegion")}
            </Label>
            <Input id="where" name="where" defaultValue={where} placeholder={inCanada ? t("jobsPage.cityOrProvince") : t("jobsPage.cityOrRegion")} />
          </div>
          <Button type="submit" className="sm:col-span-2 2xl:col-span-1">
            <Search aria-hidden /> {t("jobsPage.search")}
          </Button>
          {explicitRange ? <input type="hidden" name="range" value={explicitRange.key} /> : null}
        </form>
        <div className="grid gap-2">
        <ExternalSearchRow t={t} what={searched[0] ?? ""} where={where || null} country={country} />
        <SaveSearch params={searchOnly(query).params as Record<string, string>} suggestedName={describeSearch(query, settings)} emailAvailable={emailConfigured()} timeZone={me?.timezone ?? "UTC"} />
        </div>
      </div>

      {/* A button under the search box on phones; a sidebar beside the results from lg up. */}
      <FiltersToggle count={activeFilterCount(filters)} className="lg:sticky lg:top-20 lg:[grid-area:filters]">
      <aside className="grid gap-4" aria-label={t("jobsPage.filtersAria")}>
        <FiltersPanel t={t} sp={sp} filters={filters} provinces={inCanada ? provinces : []} provFilter={provFilter} hrefBase={href} explicitRange={explicitRange} showAdzuna={providerNames.includes("adzuna")} showUsajobs={providerNames.includes("usajobs")} showCareerjet={providerNames.includes("careerjet")} currency={currency} />
        <Disclosure id="views" summary={views.length ? t("list.savedViewsCount", { count: views.length }) : t("list.savedViews")}>
          <SavedViews page="jobs" views={views} />
        </Disclosure>
        <PreferencesCard t={t} settings={settings} resumeTitles={feed.resolved.titlesFromResume ? searched : []} />
        <Disclosure variant="plain" summary={t("jobsPage.aboutResults")} className="px-1 text-xs">
          <div className="grid gap-1.5">
            <p>
              {t("jobsPage.sourcesLead", { count: num(employerCount ?? 0), lastRead: lastRun?.finished_at ? t("jobsPage.lastRead", { ago: timeAgo(lastRun.finished_at) }) : t("jobsPage.notRead") })}
              {providerNames.includes("usajobs") ? t("jobsPage.usajobs") : ""}
              {providerNames.includes("careerjet") ? t("jobsPage.careerjet") : ""}
              {providerNames.includes("adzuna") ? t("jobsPage.adzuna") : ""}.{" "}
              <Link href="/jobs/employers" className="underline underline-offset-4">
                {t("jobsPage.seeEmployers")}
              </Link>
              .
            </p>
            <p>{t("jobsPage.noteLinks")}</p>
            <p>
              {t("jobsPage.noteLinkedInA")}
              <Link href="/jobs/add" className="underline underline-offset-4">
                {t("jobsPage.notePaste")}
              </Link>
              {t("jobsPage.noteLinkedInB")}
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
              <p className="font-medium">{t("jobsPage.startResume")}</p>
              <p className="text-sm text-muted-foreground">{t("jobsPage.startResumeDesc")}</p>
            </div>
            <Link href="/jobs/resume" className={buttonVariants({ size: "sm" })}>
              {t("jobsPage.importResume")}
            </Link>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-0.5">
            <h2 id="results-heading" className="text-lg font-semibold">
              {t("jobsPage.resultsHeading", { what: label ? t("jobsPage.whatJobs", { label }) : t("jobsPage.jobsWord"), range: t(`range.heading_${range.key}` as MessageKey) })}
            </h2>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {list.length ? t("jobsPage.showing", { from: (current - 1) * PAGE + 1, to: Math.min(current * PAGE, list.length), total: num(list.length) }) : t("jobsPage.noMatching")}
              {t("jobsPage.inPlace", { place: placeName })}
              {where && !whereProvince ? t("jobsPage.near", { where }) : ""}
              {feed.loadedRows >= MAX_FEED_ROWS ? t("jobsPage.newest", { count: num(MAX_FEED_ROWS) }) : ""}
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
                <AlertDescription>{t("jobsPage.sourcesUnavailable")}</AlertDescription>
              </Alert>
            ) : null}
            {newlyFetched && !filters.includeUnchecked ? (
              <Alert variant="info" role="status">
                <Info aria-hidden />
                <AlertDescription>
                {newlyFetched === 1 ? t("jobsPage.newListingsOne") : t("jobsPage.newListingsMany", { count: newlyFetched })}
              </AlertDescription>
              </Alert>
            ) : null}
            <p className="text-muted-foreground">
              {!filters.includeUnchecked ? t("jobsPage.onlyVerified") : ""}
              {excludedCount ? (excludedCount === 1 ? t("jobsPage.leftOutOne") : t("jobsPage.leftOutMany", { count: excludedCount })) : ""}
              {!filters.includeUnchecked ? (
                <Link href={href({ unchecked: "1", page: "" })} className="underline underline-offset-4">
                  {t("jobsPage.includeUnverified")}
                </Link>
              ) : null}
            </p>
          </div>
        ) : null}

        <nav aria-label={t("jobsPage.fitNav")} data-tour="jobs-tabs" className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {TABS.map((tab_) => {
            const tt = t;
            const active = tab === tab_.key;
            return (
              <Link
                key={tab_.key}
                href={href({ tab: tab_.key, page: "" })}
                aria-current={active ? "page" : undefined}
                className={cn("inline-flex shrink-0 items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40", active && "border-primary bg-accent font-medium text-accent-foreground")}
              >
                <span aria-hidden className={cn("size-2 rounded-full", TIER_STYLE[tab_.tier].dot)} />
                {tt(tab_.label as MessageKey)}
                <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">({inTab[tab_.key].length})</span>
              </Link>
            );
          })}
        </nav>

        {shown.length === 0 ? (
          <EmptyState t={t} tab={tab} hasResume={Boolean(resume)} href={href} searched={searched} explicitRange={explicitRange} filtered={activeFilterCount(filters) > 0} where={where} />
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
                  iconUrl={employer?.has_icon && j.employer_id ? `/api/employer-icon/${j.employer_id}` : null}
                  breakdown={fit?.success ? fitBreakdown(fit.data.requirements, fit.data.results, (t) => skillsIn(t).map((s) => s.name)) : []}
                  pay={payBar(j, filters.minSalary, currency)}
                />
              );
            })}
          </ul>
        )}

        <PageNav current={current} pages={pages} href={(n) => href({ page: String(n) })} />
        <CompareBar />
      </section>
    </div>
  );
}

function EmptyState({
  t,
  tab,
  hasResume,
  href,
  searched,
  explicitRange,
  filtered,
  where,
}: {
  t: Translator;
  tab: Tab;
  hasResume: boolean;
  href: (over: Record<string, string>) => string;
  searched: string[];
  explicitRange: Range | null;
  filtered: boolean;
  where: string;
}) {
  if (tab === "saved") {
    return (
      <EmptyPanel icon={<Bookmark aria-hidden />} title={t("jobsPage.emptySavedTitle")} description={t("jobsPage.emptySavedDesc")}>
        <Link href={href({ tab: "all", page: "" })} className={buttonVariants({ size: "sm" })}>
          {t("jobsPage.browseAll")}
        </Link>
      </EmptyPanel>
    );
  }
  if (tab !== "all" && !hasResume) {
    return (
      <EmptyPanel icon={<FileText aria-hidden />} title={t("jobsPage.emptyResumeTitle")} description={t("jobsPage.emptyResumeDesc")}>
        <Link href="/jobs/resume" className={buttonVariants({ size: "sm" })}>
          {t("jobsPage.addResume")}
        </Link>
      </EmptyPanel>
    );
  }
  const related = searched[0] ? [...relatedTitles(searched[0]).related, ...relatedTitles(searched[0]).broader].slice(0, 2) : [];
  const actions = [
    explicitRange?.key !== "30d" ? { label: t("jobsPage.expandRange"), href: href({ range: "30d", page: "" }) } : null,
    where ? { label: t("jobsPage.searchAllProvinces"), href: href({ where: "", page: "" }) } : { label: t("jobsPage.changeLocation"), href: "#preferences" },
    filtered ? { label: t("jobsPage.removeFilters"), href: href({ wp: "", wpu: "", level: "", type: "", pay: "", minpay: "", company: "", src: "", page: "" }) } : null,
    ...related.map((rt) => ({ label: t("jobsPage.tryTitle", { title: rt }), href: href({ q: rt, page: "" }) })),
  ].filter((a): a is { label: string; href: string } => a !== null);
  return (
    <EmptyPanel
      icon={<SearchX aria-hidden />}
      title={t("jobsPage.emptyNoneTitle")}
      description={t("jobsPage.emptyNoneDesc")}
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
  t,
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
  t: Translator;
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
          <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" /> {t("jobsPage.filters")}
          {activeFilterCount(filters) ? <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeFilterCount(filters)}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {provinces.length ? (
        <div className="grid gap-1.5" role="group" aria-label={t("jobsPage.province")}>
          <p className="text-xs font-medium text-muted-foreground">{t("jobsPage.province")}</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip href={hrefBase({ prov: "", where: "", page: "" })} active={!provFilter.length} label={t("jobsPage.allMine")} />
            {provinces.map((p) => (
              <Chip key={p} href={hrefBase({ prov: p, where: "", page: "" })} active={provFilter.length === 1 && provFilter[0] === p} label={p} title={PROVINCE_NAMES[p as ProvinceCode]} />
            ))}
          </div>
        </div>
        ) : null}
        <div className="grid gap-1.5" role="group" aria-label={t("jobsPage.postedWithin")}>
          <p className="text-xs font-medium text-muted-foreground">{t("jobsPage.posted")}</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip href={hrefBase({ range: "", page: "" })} active={!explicitRange} label={t("jobsPage.bestMatch")} />
            {RANGES.map((r) => (
              <Chip key={r.key} href={hrefBase({ range: r.key, page: "" })} active={explicitRange?.key === r.key} label={t(`range.${r.key}` as MessageKey)} />
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
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("jobsPage.workplace")}</legend>
            {(Object.keys(WORKPLACE_LABELS) as (keyof typeof WORKPLACE_LABELS)[]).map((w) => (
              <label key={w} className="flex min-h-7 items-center gap-2">
                <Checkbox name="wp" value={w} defaultChecked={checked(filters.workplace, w)} /> {t(`workplace.${w}`)}
              </label>
            ))}
            <label className="flex min-h-7 items-center gap-2 text-xs text-muted-foreground">
              <Checkbox name="wpu" value="1" defaultChecked={filters.includeUnknownWorkplace} /> {t("jobsPage.includeUnknownWorkplace")}
            </label>
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("jobsPage.levelLegend")}</legend>
            {LEVELS.map((l) => (
              <label key={l} className="flex min-h-7 items-center gap-2">
                <Checkbox name="level" value={l} defaultChecked={checked(filters.levels, l)} /> {t(`level.${l}`)}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">{t("jobsPage.levelNote")}</p>
          </fieldset>
          <Disclosure
            data-testid="more-filters"
            summary={
              <>
                {t("jobsPage.moreFilters")} <span className="font-normal text-muted-foreground">{t("jobsPage.moreFiltersSub")}</span>
              </>
            }
          >
            <div className="grid gap-3">
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("jobsPage.employmentType")}</legend>
            {(
              [
                ["full", t("jobsPage.fullTime")],
                ["part", t("jobsPage.partTime")],
                ["contract", t("jobsPage.contract")],
                ["internship", t("jobsPage.internship")],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="flex min-h-7 items-center gap-2">
                <Checkbox name="type" value={v} defaultChecked={checked(filters.types, v)} /> {l}
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("jobsPage.salary")}</legend>
            <label className="flex min-h-7 items-center gap-2">
              <Checkbox name="pay" value="1" defaultChecked={filters.hasSalary} /> {t("jobsPage.salaryStated")}
            </label>
            {currency ? (
              <>
                <Label htmlFor="minpay" className="text-xs">
                  {t("jobsPage.atLeast", { currency })}
                </Label>
                <Input id="minpay" name="minpay" type="number" min={0} step={5000} defaultValue={filters.minSalary ?? ""} placeholder="70000" />
                <p className="text-xs text-muted-foreground">{t("jobsPage.onlyCurrency", { currency })}</p>
              </>
            ) : null}
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="company" className="text-xs">
              {t("jobsPage.company")}
            </Label>
            <Input id="company" name="company" defaultValue={filters.company} />
          </div>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("jobsPage.source")}</legend>
            {(
              [
                ["ats", t("jobsPage.srcAts")],
                ["jobicy", "Jobicy"],
                ["remotive", "Remotive"],
                ["arbeitnow", "Arbeitnow"],
                ...(showUsajobs ? ([["usajobs", "USAJOBS"]] as const) : []),
                ...(showAdzuna ? ([["adzuna", "Adzuna"]] as const) : []),
                ...(showCareerjet ? ([["careerjet", "Careerjet"]] as const) : []),
                ["manual", t("jobsPage.srcManual")],
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
              {t("jobsPage.includeUnchecked")} <span className="block text-xs text-muted-foreground">{t("jobsPage.applyStaysOff")}</span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">{t("jobsPage.noSponsorship")}</p>
            </div>
          </Disclosure>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              {t("jobsPage.applyFilters")}
            </Button>
            <Link href={hrefBase({ wp: "", wpu: "", level: "", type: "", pay: "", minpay: "", company: "", src: "", unchecked: "", page: "" })} className={buttonVariants({ size: "sm", variant: "ghost" })}>
              {t("jobsPage.clear")}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PreferencesCard({ t, settings, resumeTitles }: { t: Translator; settings: { job_titles: string[]; job_country: string; job_provinces: string[]; job_exclude_keywords: string[] }; resumeTitles: string[] }) {
  return (
    <Card size="sm" id="preferences">
      <CardContent>
        <details>
          <summary className="cursor-pointer rounded-md text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            {t("jobsPage.prefsTitle")}
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              {settings.job_titles.length
                ? t("jobsPage.prefsDefault", { titles: settings.job_titles.join(", ") })
                : resumeTitles.length
                  ? t("jobsPage.prefsFromResume", { titles: resumeTitles.join(", ") })
                  : t("jobsPage.prefsNone")}
            </span>
          </summary>
          <LocaleScope groups={["ui"]}>
          <ActionForm action={saveJobPreferences} submitLabel={t("jobsPage.savePrefs")} size="sm" className="mt-3">
            <div className="grid gap-1.5">
              <Label htmlFor="titles">{t("jobsPage.jobTitlesLabel")}</Label>
              <Textarea id="titles" name="titles" rows={3} defaultValue={settings.job_titles.join("\n")} placeholder={t("jobsPage.jobTitlesPlaceholder")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pref-country">{t("jobsPage.prefCountry")}</Label>
              <CountrySelect t={t} id="pref-country" name="country" value={settings.job_country} />
              <p className="text-xs text-muted-foreground">{t("jobsPage.prefCountryNote")}</p>
            </div>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-sm font-medium">{t("jobsPage.provincesLegend")}</legend>
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
              <Label htmlFor="exclude">{t("jobsPage.excludeLabel")}</Label>
              <Input id="exclude" name="exclude" defaultValue={settings.job_exclude_keywords.join(", ")} placeholder="Senior, Manager" />
            </div>
          </ActionForm>
          </LocaleScope>
        </details>
      </CardContent>
    </Card>
  );
}

/** The same search on sites the app can't read, opened by the user in a new tab. */
function ExternalSearchRow({ t, what, where, country }: { t: Translator; what: string; where: string | null; country: string }) {
  const links = externalSearchLinks({ what, where, country });
  if (!links.length) return null;
  return (
    <nav aria-label={t("jobsPage.otherSites")} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
      <span>{t("jobsPage.alsoSearch", { what })}</span>
      {links.map((l) => (
        <a key={l.site} href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
          {l.label}
          <span className="sr-only">{t("jobsPage.opensNewTab")}</span>
        </a>
      ))}
      <span>
        {t("jobsPage.foundOne")}
        <Link href="/jobs/add" className="underline underline-offset-4">
          {t("jobsPage.pasteHere")}
        </Link>
      </span>
    </nav>
  );
}

/** One country at a time, or remote jobs open anywhere. */
function CountrySelect({ t, id, name, value }: { t: Translator; id: string; name: string; value: string }) {
  return (
    <AppSelect id={id} name={name} defaultValue={value}>
      <option value={ANYWHERE}>{t("jobsPage.anywhereRemote")}</option>
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
