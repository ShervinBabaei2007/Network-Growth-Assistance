import { getLocale, getT } from "@/lib/i18n/server";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PeopleAtCompany } from "@/components/companies/people-at-company";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatDay } from "@/lib/applications/format";
import { counts, keyFromSlug, matchCompany } from "@/lib/companies/match";
import { loadDecisions } from "@/lib/companies/people";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Company · Network Growth" };

export default function CompanyPage({ params }: PageProps<"/companies/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton labelKey="loading.generic" />}>
      <Company params={params} />
    </Suspense>
  );
}

async function Company({ params }: Pick<PageProps<"/companies/[slug]">, "params">) {
  const { slug } = await params;
  const key = keyFromSlug(slug);
  if (!key || key.length > 200) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) notFound();
  const first = key.split(" ")[0].replace(/[^a-z0-9]/g, "");
  const like = `%${first}%`;

  const [decisions, { data: settings }, { data: apps }, { data: jobs }] = await Promise.all([
    loadDecisions(supabase, userId),
    supabase.from("settings").select("timezone").single(),
    supabase.from("applications").select("id, title, company, stage, attempt, stage_changed_at, job_id").ilike("company", like).order("stage_changed_at", { ascending: false }).limit(200),
    supabase
      .from("jobs")
      .select("id, title, company, location_text, posted_at, verification_status")
      .ilike("company", like)
      .is("closed_at", null)
      .eq("verification_status", "verified")
      .order("posted_at", { ascending: false })
      .limit(300),
  ]);
  const tz = settings?.timezone ?? "UTC";
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const same = (name: string | null) => Boolean(name) && counts(matchCompany(key, name, decisions));
  const myApps = (apps ?? []).filter((a) => same(a.company));
  const openJobs = (jobs ?? []).filter((j) => same(j.company));
  // The name as it's written somewhere the user has seen it, else the key.
  const display = myApps[0]?.company ?? openJobs[0]?.company ?? key.replace(/\b\w/g, (c) => c.toUpperCase());

  const appIds = myApps.map((a) => a.id);
  const { data: referrals } = appIds.length
    ? await supabase.from("application_events").select("id, application_id, detail, occurred_at").eq("kind", "referral").in("application_id", appIds).order("occurred_at", { ascending: false })
    : { data: [] };
  const titleOf = new Map(myApps.map((a) => [a.id, a.title]));

  return (
    <div className="grid gap-6">
      <PageHeader back={{ href: "/applications", label: t("msg.applications1ddf") }} title={display} description={t("msg.yourApplicationsOpenJobsf628")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-6">
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t("msg.yourApplications6dab")}</CardTitle>
              <CardDescription>{t("msg.everyAttemptIncludingClosed28ba")}</CardDescription>
            </CardHeader>
            <CardContent>
              {myApps.length ? (
                <ul className="grid gap-2 text-sm">
                  {myApps.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/applications/${a.id}`} className="font-medium hover:underline">
                        {a.title}
                        {a.attempt > 1 ? <span className="font-normal text-muted-foreground"> {t("jobDetail.attemptSuffix", { n: a.attempt }).trim()}</span> : null}
                      </Link>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{t(`stage.${a.stage}` as "stage.saved")}</Badge>
                        {formatDay(a.stage_changed_at, tz, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("msg.youHavenTSaved0faa")}</p>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>{t("msg.openJobs08d9")}</CardTitle>
              <CardDescription>{t("msg.verifiedListingsCurrentlyIn75e4")}</CardDescription>
            </CardHeader>
            <CardContent>
              {openJobs.length ? (
                <ul className="grid gap-2 text-sm">
                  {openJobs.slice(0, 50).map((j) => (
                    <li key={j.id} className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                        {j.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {[j.location_text, t("companyPage.posted", { date: formatDay(j.posted_at, tz, locale) })].filter(Boolean).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("msg.noVerifiedOpenJobs9306")}</p>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>{t("msg.referrals14ea")}</CardTitle>
              <CardDescription>{t("msg.whatYouRecordedOn2896")}</CardDescription>
            </CardHeader>
            <CardContent>
              {referrals?.length ? (
                <ul className="grid gap-2 text-sm">
                  {referrals.map((r) => (
                    <li key={r.id}>
                      <span className="font-medium">{r.detail}</span>
                      <span className="text-muted-foreground"> · {titleOf.get(r.application_id)} · {formatDateTime(r.occurred_at, tz, locale)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("msg.noReferralsRecorded6372")}</p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="grid content-start gap-6">
          <Suspense fallback={null}>
            <PeopleAtCompany onCompanyPage company={display} applicationId={myApps.find((a) => !["accepted", "rejected", "withdrawn", "no_response"].includes(a.stage))?.id ?? null} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
