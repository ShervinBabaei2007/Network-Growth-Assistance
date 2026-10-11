import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, Clock, FileText, MapPin, Plus, SlidersHorizontal } from "lucide-react";
import { FitScore, SourceTag, TIER_STYLE, type TierKey } from "@/components/jobs/job-visuals";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { NativeSelect } from "@/components/native-select";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AtsKind } from "@/lib/job-postings/ats/types";
import { parseRange, RANGES, rangeSince, titleQuery } from "@/lib/job-postings/feed";
import { placeLabel, timeAgo } from "@/lib/job-postings/labels";
import { byPriority } from "@/lib/job-postings/regions";
import { chunk, loadActiveResume, MAX_SCORED_PER_VIEW, scoreJobs, type MatchRow } from "@/lib/job-postings/service";
import { jobServices } from "@/lib/job-postings/services";
import { jobSource } from "@/lib/job-postings/source";
import { PROVINCE_CODES, PROVINCE_NAMES, SENIORITY, SENIORITY_LABELS, type ProvinceCode } from "@/lib/job-postings/types";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { saveJobPreferences } from "./actions";

export const metadata = { title: "Jobs · Network Growth" };

const TABS = [
  { key: "matches", label: "Matches", tier: "strong" },
  { key: "stretch", label: "Stretch", tier: "stretch" },
  { key: "excluded", label: "Doesn't qualify", tier: "excluded" },
  { key: "unchecked", label: "Not checked", tier: "unchecked" },
  { key: "saved", label: "Saved & applied", tier: "good" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const PAGE = 50;
/** The most postings one view loads (the API's row limit). */
const MAX_ROWS = 1000;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Jobs"
        description="Recent postings in Canada from employers' own job boards, British Columbia first, then Ontario. Each one is checked against your resume; you apply on the employer's site."
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
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading postings…</p>}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type JobRow = {
  id: string;
  title: string;
  company: string | null;
  city: string | null;
  province: string | null;
  remote: boolean;
  posted_at: string;
  salary: string | null;
  apply_url: string;
  user_id: string | null;
  employer_id: string | null;
};
const JOB_FIELDS = "id, title, company, city, province, remote, posted_at, salary, apply_url, user_id, employer_id";
type EmployerInfo = { name: string; ats: AtsKind };

async function Feed({ searchParams }: Pick<PageProps<"/jobs">, "searchParams">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const services = jobServices();
  const range = parseRange(one(sp.range));

  const [{ data: settings }, resume, { data: lastRun }, { count: employerCount }, { data: states }] = await Promise.all([
    supabase.from("settings").select("job_titles, job_provinces, job_seniority, job_exclude_keywords").single(),
    loadActiveResume(supabase),
    supabase.from("job_crawl_runs").select("finished_at").not("finished_at", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("employers").select("id", { count: "exact", head: true }).neq("status", "disabled"),
    supabase.from("job_user_states").select("job_id, status"),
  ]);
  if (!settings || !userId) return <LoadError what="postings" />;

  const provinces = byPriority(settings.job_provinces);
  const provFilter = one(sp.prov)
    .split(",")
    .filter((p): p is ProvinceCode => (PROVINCE_CODES as readonly string[]).includes(p));
  const remoteOnly = one(sp.remote) === "1";
  const allTitles = one(sp.all) === "1";
  const tab: Tab = (TABS.find((t) => t.key === one(sp.tab))?.key ?? "matches") as Tab;
  const page = Math.max(1, Number(one(sp.page)) || 1);

  // Open jobs in the time range and the user's provinces (or remote anywhere in Canada), optionally matching their titles.
  let query = supabase
    .from("jobs")
    .select(JOB_FIELDS)
    .gte("posted_at", rangeSince(range))
    .is("closed_at", null)
    .neq("date_source", "unknown")
    .or(`province.in.(${(provFilter.length ? provFilter : provinces).join(",")}),and(province.is.null,remote.is.true)`)
    .order("posted_at", { ascending: false })
    .limit(MAX_ROWS);
  const tsq = !allTitles && settings.job_titles.length ? titleQuery(settings.job_titles) : null;
  if (tsq) query = query.textSearch("fts", tsq, { config: "english" });
  if (remoteOnly) query = query.eq("remote", true);
  const stateBy = new Map((states ?? []).map((s) => [s.job_id, s.status]));
  const savedIds = (states ?? []).filter((s) => s.status !== "dismissed").map((s) => s.job_id);
  const [fresh, ...savedParts] = await Promise.all([query, ...chunk(savedIds.slice(0, 300), 100).map((ids) => supabase.from("jobs").select(JOB_FIELDS).in("id", ids))]);
  if (fresh.error || savedParts.some((p) => p.error)) return <LoadError what="postings" />;
  const savedJobs = savedParts.flatMap((p) => (p.data ?? []) as JobRow[]);

  const excluded = settings.job_exclude_keywords.map((k) => k.toLowerCase());
  const freshRows = (fresh.data as JobRow[]).filter((j) => stateBy.get(j.id) !== "dismissed" && !excluded.some((k) => j.title.toLowerCase().includes(k)));
  const allRows = [...new Map([...freshRows, ...savedJobs].map((j) => [j.id, j])).values()];

  // Where each posting came from.
  const employerIds = [...new Set(allRows.map((j) => j.employer_id).filter((id): id is string => Boolean(id)))];
  const employerParts = await Promise.all(chunk(employerIds, 100).map((ids) => supabase.from("employers").select("id, name, ats").in("id", ids)));
  const employerBy = new Map<string, EmployerInfo>(employerParts.flatMap((p) => (p.data ?? []).map((e) => [e.id, { name: e.name, ats: e.ats }] as const)));

  // Fit: reuse saved checks, and check the rest now (rules and database queries; no outside calls).
  const matchBy = new Map<string, MatchRow>();
  if (resume) {
    const ids = allRows.map((j) => j.id);
    const parts = await Promise.all(chunk(ids, 100).map((part) => supabase.from("job_matches").select("id, job_id, fit_score, tier, summary, method, updated_at").eq("resume_id", resume.id).in("job_id", part)));
    for (const m of parts.flatMap((p) => p.data ?? [])) if (Date.parse(m.updated_at) >= Date.parse(resume.updatedAt)) matchBy.set(m.job_id, m);
    const todo = ids.filter((id) => !matchBy.has(id)).slice(0, MAX_SCORED_PER_VIEW);
    if (todo.length) for (const [id, m] of await scoreJobs(supabase, userId, resume, todo, services.embedder)) matchBy.set(id, m);
  }

  const inTab: Record<Tab, JobRow[]> = {
    matches: freshRows.filter((p) => ["strong", "good"].includes(matchBy.get(p.id)?.tier ?? "")),
    stretch: freshRows.filter((p) => matchBy.get(p.id)?.tier === "stretch"),
    excluded: freshRows.filter((p) => matchBy.get(p.id)?.tier === "excluded"),
    unchecked: freshRows.filter((p) => !matchBy.has(p.id)),
    saved: savedJobs,
  };
  const sorted = [...inTab[tab]].sort((a, b) => (matchBy.get(b.id)?.fit_score ?? -1) - (matchBy.get(a.id)?.fit_score ?? -1) || b.posted_at.localeCompare(a.posted_at));
  const rows = sorted.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  // Grouped by province in priority order (BC first), remote roles last.
  const groups = [...byPriority(rows.map((r) => r.province ?? "")), null].map((prov) => ({ prov, rows: rows.filter((r) => (r.province ?? null) === prov) })).filter((g) => g.rows.length);

  const href = (over: Record<string, string>) => {
    const s = new URLSearchParams();
    const merged = { range: range.key, tab, prov: provFilter.join(","), remote: remoteOnly ? "1" : "", all: allTitles ? "1" : "", page: "", ...over };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "tab" && v === "matches") && !(k === "page" && v === "1") && !(k === "range" && v === "1d")) s.set(k, v);
    return `/jobs${s.size ? `?${s}` : ""}`;
  };
  const shownProvinces = provFilter.length ? provFilter : provinces;

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      {/* Filters: secondary, so they sit to the side on wide screens. */}
      {/* On phones the postings come first and the filters follow; side by side from lg up. */}
      <aside className="order-last grid gap-4 lg:sticky lg:top-6 lg:order-none" aria-label="Filters and preferences">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FilterGroup label="Province">
              <Chip href={href({ prov: "", page: "" })} active={!provFilter.length} label="All mine" />
              {provinces.map((p) => (
                <Chip key={p} href={href({ prov: p, page: "" })} active={provFilter.length === 1 && provFilter[0] === p} label={p} title={PROVINCE_NAMES[p]} />
              ))}
            </FilterGroup>
            <FilterGroup label="Work style">
              <Chip href={href({ remote: "", page: "" })} active={!remoteOnly} label="Any" />
              <Chip href={href({ remote: "1", page: "" })} active={remoteOnly} label="Remote only" />
            </FilterGroup>
            {settings.job_titles.length ? (
              <FilterGroup label="Job titles">
                <Chip href={href({ all: "", page: "" })} active={!allTitles} label="My titles" />
                <Chip href={href({ all: "1", page: "" })} active={allTitles} label="All titles" />
              </FilterGroup>
            ) : null}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Search preferences</CardTitle>
            <CardDescription className="text-xs">
              {settings.job_titles.length ? `Titles like ${settings.job_titles.join(", ")}.` : "No titles set: showing every job."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-primary">Edit preferences</summary>
              <ActionForm action={saveJobPreferences} submitLabel="Save preferences" size="sm" className="mt-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="titles">Job titles (one per line, up to 6)</Label>
                  <Textarea id="titles" name="titles" rows={3} defaultValue={settings.job_titles.join("\n")} placeholder={"Junior Software Developer\nQA Analyst"} />
                  <p className="text-xs text-muted-foreground">&ldquo;Developer&rdquo; also finds Engineer and Programmer roles.</p>
                </div>
                <fieldset className="grid gap-1.5">
                  <legend className="mb-1 text-sm font-medium">Provinces</legend>
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
                  <Label htmlFor="seniority">Your level</Label>
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

        <div className="grid gap-1 px-1 text-xs text-muted-foreground">
          <p>
            From {(employerCount ?? 0).toLocaleString("en-CA")} employers&apos; job boards.{" "}
            {lastRun?.finished_at ? `Last read ${timeAgo(lastRun.finished_at)}.` : "Not read yet."}
          </p>
          {services.limitations.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </aside>

      <section aria-labelledby="postings-heading" className="grid min-w-0 gap-4">
        {!resume ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-info-soft p-4">
            <div className="grid gap-0.5">
              <p className="font-medium">Start with your resume</p>
              <p className="text-sm text-muted-foreground">Upload it as a PDF to see how well each posting fits.</p>
            </div>
            <Link href="/jobs/resume" className={buttonVariants({ size: "sm" })}>
              Upload resume
            </Link>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-0.5">
            <h2 id="postings-heading" className="text-lg font-semibold">
              Postings from {range.heading}
            </h2>
            <p className="text-sm text-muted-foreground">
              {freshRows.length.toLocaleString("en-CA")} in {shownProvinces.map((p) => PROVINCE_NAMES[p]).join(", ")}
              {remoteOnly ? " (remote)" : ""}
              {fresh.data.length >= MAX_ROWS ? ` · showing the newest ${MAX_ROWS.toLocaleString("en-CA")}` : ""}
            </p>
          </div>
          {/* Time range: a quick switch, kept in the URL so it can be shared and bookmarked. */}
          <nav aria-label="Posted within" className="inline-flex rounded-lg border bg-card p-0.5 shadow-xs">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={href({ range: r.key, page: "" })}
                aria-current={range.key === r.key ? "page" : undefined}
                className={cn("rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground", range.key === r.key && "bg-primary text-primary-foreground hover:text-primary-foreground")}
              >
                {r.label}
              </Link>
            ))}
          </nav>
        </div>

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
                <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">({inTab[t.key].length})</span>
              </Link>
            );
          })}
        </nav>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{emptyText(tab, freshRows.length, Boolean(resume), range.key)}</p>
        ) : (
          groups.map((g) => (
            <div key={g.prov ?? "remote"} className="grid gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {g.prov ? PROVINCE_NAMES[g.prov as ProvinceCode] : "Remote in Canada"} · {g.rows.length}
              </h3>
              <ul className="grid gap-2">
                {g.rows.map((p) => (
                  <JobCard key={p.id} p={p} m={matchBy.get(p.id)} status={stateBy.get(p.id)} employer={p.employer_id ? employerBy.get(p.employer_id) : null} />
                ))}
              </ul>
            </div>
          ))
        )}
        {pages > 1 ? (
          <nav aria-label="Pages" className="flex items-center justify-center gap-3 text-sm">
            {page > 1 ? (
              <Link href={href({ page: String(page - 1) })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                ← Previous
              </Link>
            ) : null}
            <span className="text-muted-foreground">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={href({ page: String(page + 1) })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Next →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}

function emptyText(tab: Tab, total: number, hasResume: boolean, range: string) {
  if (!total && tab !== "saved") return range === "1d" ? "Nothing posted in the last 24 hours matches yet. Try the past week, “All titles”, or add employers you'd like to work for." : "No postings match. Try “All titles” or a longer time range.";
  if (tab === "unchecked") return "Every posting has been checked.";
  if (tab === "saved") return "Nothing saved yet.";
  if (!hasResume) return "Upload your resume to sort postings by fit.";
  return "No postings here with these filters.";
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5" role="group" aria-label={label}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
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

function JobCard({ p, m, status, employer }: { p: JobRow; m: MatchRow | undefined; status: string | undefined; employer: EmployerInfo | null | undefined }) {
  const tier: TierKey = m?.tier ?? "unchecked";
  return (
    <li className={cn("grid grid-cols-[4.75rem_minmax(0,1fr)] gap-4 rounded-xl border border-l-4 bg-card p-4 shadow-xs transition-shadow hover:shadow-sm", TIER_STYLE[tier].border)}>
      <FitScore tier={tier} score={m?.fit_score ?? null} />
      <div className="grid min-w-0 gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/jobs/${p.id}`} className="text-base leading-snug font-semibold hover:text-primary hover:underline">
            {p.title}
          </Link>
          {status === "applied" || status === "saved" ? (
            <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">{status === "applied" ? "Applied" : "Saved"}</span>
          ) : null}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          {p.company ? (
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Building2 aria-hidden className="size-3.5 text-muted-foreground" />
              {p.company}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden className="size-3.5" />
            {placeLabel(p)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden className="size-3.5" />
            {p.user_id ? "added by you" : `posted ${timeAgo(p.posted_at)}`}
          </span>
          {p.salary ? <span>{p.salary}</span> : null}
        </p>
        {m?.summary ? <p className="line-clamp-2 text-sm text-muted-foreground">{m.summary}</p> : null}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <SourceTag source={jobSource(p, employer)} />
          <a href={p.apply_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Employer&apos;s posting <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
        </div>
      </div>
    </li>
  );
}
