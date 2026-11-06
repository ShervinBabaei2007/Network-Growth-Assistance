import { getLocale, getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n";
import { Suspense } from "react";
import Link from "next/link";
import { FitChip, type TierKey } from "@/components/jobs/job-visuals";
import { LoadError } from "@/components/load-error";
import { PageHeaderT } from "@/components/tx";
import { PageSkeleton } from "@/components/page-skeleton";
import { buildColumn, COMPARE_ROWS, parseCompareIds, type CompareColumn, type CompareJob } from "@/lib/job-postings/compare-jobs";
import { explainFit } from "@/lib/job-postings/fit";
import { StoredFit } from "@/lib/job-postings/schemas";
import { loadActiveResume } from "@/lib/job-postings/service";
import { jobSource } from "@/lib/job-postings/source";
import { skillsIn } from "@/lib/job-postings/taxonomy";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Compare jobs · Network Growth" };

export default function ComparePage({ searchParams }: PageProps<"/jobs/compare">) {
  return (
    <div className="grid gap-6">
      <PageHeaderT back={{ href: "/jobs", label: "pages.backJobs" }} title="pages.compare.title" description="pages.compare.description" />
      <Suspense fallback={<PageSkeleton labelKey="loading.comparison" />}>
        <Compare searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Compare({ searchParams }: Pick<PageProps<"/jobs/compare">, "searchParams">) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const raw = (await searchParams).ids;
  const ids = parseCompareIds(Array.isArray(raw) ? raw[0] : raw);
  if (ids.length < 2) {
    return (
      <p className="text-sm">
        {t("compare.pickA")}
        <Link href="/jobs" className="font-medium text-primary underline underline-offset-4">
          {t("compare.jobsPage")}
        </Link>
        {t("compare.pickB")}
      </p>
    );
  }
  const supabase = await createClient();
  const resume = await loadActiveResume(supabase);
  const [{ data: jobs, error }, { data: matches }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, company, city, province, country, countries, remote, workplace_type, posted_at, date_source, date_note, salary, employment_type, experience_level, source, user_id, employer_id, apply_url")
      .in("id", ids),
    resume ? supabase.from("job_matches").select("job_id, tier, fit_score, requirement_results").eq("resume_id", resume.id).in("job_id", ids) : Promise.resolve({ data: [] }),
  ]);
  if (error) return <LoadError what="these jobs" />;
  const employerIds = [...new Set(jobs.map((j) => j.employer_id).filter((x): x is string => Boolean(x)))];
  const { data: employerRows } = employerIds.length ? await supabase.from("employers").select("id, name, ats").in("id", employerIds) : { data: [] };
  const employerBy = new Map((employerRows ?? []).map((e) => [e.id, e]));
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const matchBy = new Map((matches ?? []).map((m) => [m.job_id, m]));
  const columns = ids
    .map((id) => byId.get(id))
    .filter((j): j is NonNullable<typeof j> => Boolean(j))
    .map((j) => {
      const m = matchBy.get(j.id);
      const stored = m ? StoredFit.safeParse(m.requirement_results) : null;
      const e = stored?.success ? explainFit(stored.data.requirements, stored.data.results, (t) => skillsIn(t).map((s) => s.name)) : null;
      const fit = m ? { tier: m.tier, score: m.fit_score, strong: e?.strong ?? [], missing: e?.missing ?? [] } : null;
      return buildColumn(j as CompareJob, fit, jobSource(j, j.employer_id ? employerBy.get(j.employer_id) : null).label, { t, locale });
    });
  if (columns.length < 2) return <LoadError what="these jobs" />;

  // Phones show one card per job; wide screens show a table with a row per detail.
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {columns.map((c) => (
          <section key={c.id} className="grid gap-2 rounded-xl border bg-card p-4" aria-label={c.title}>
            <Header c={c} />
            <dl className="grid gap-1 text-sm">
              {COMPARE_ROWS.map(([key]) => (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t(`compare.row_${key}` as "compare.row_pay")}</dt>
                  <dd className="text-right">{c.rows[key]}</dd>
                </div>
              ))}
            </dl>
            <Fit c={c} t={t} />
          </section>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">{t("compare.caption")}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-36 p-2 text-left font-medium text-muted-foreground">
                {t("compare.detail")}
              </th>
              {columns.map((c) => (
                <th key={c.id} scope="col" className="p-2 text-left align-top">
                  <Header c={c} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map(([key]) => (
              <tr key={key} className="border-t">
                <th scope="row" className="p-2 text-left font-medium text-muted-foreground">
                  {t(`compare.row_${key}` as "compare.row_pay")}
                </th>
                {columns.map((c) => (
                  <td key={c.id} className="p-2 align-top">
                    {c.rows[key]}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t">
              <th scope="row" className="p-2 text-left font-medium text-muted-foreground">
                {t("jobsPage.cardFitHeading")}
              </th>
              {columns.map((c) => (
                <td key={c.id} className="p-2 align-top">
                  <Fit c={c} t={t} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Header({ c }: { c: CompareColumn }) {
  return (
    <div className="grid gap-1">
      <Link href={`/jobs/${c.id}`} className="font-semibold hover:text-primary hover:underline">
        {c.title}
      </Link>
      {c.company ? <span className="font-normal text-muted-foreground">{c.company}</span> : null}
      {c.fit ? <FitChip tier={c.fit.tier as TierKey} score={c.fit.score} /> : null}
    </div>
  );
}

function Fit({ c, t }: { c: CompareColumn; t: Translator }) {
  if (!c.fit) return <p className="text-muted-foreground">{t("compare.notChecked")}</p>;
  return (
    <div className="grid gap-1">
      {c.strong.length ? (
        <p>
          <span className="text-muted-foreground">{t("jobsPage.cardMatches")}</span>
          {c.strong.slice(0, 6).join(", ")}
        </p>
      ) : null}
      {c.missing.length ? (
        <p>
          <span className="text-muted-foreground">{t("jobsPage.cardMissing")}</span>
          {c.missing.slice(0, 6).join(", ")}
        </p>
      ) : null}
      {!c.strong.length && !c.missing.length ? <p className="text-muted-foreground">{t("compare.noRequirements")}</p> : null}
    </div>
  );
}
