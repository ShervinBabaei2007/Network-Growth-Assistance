import { unstable_rethrow } from "next/navigation";
import { Disclosure } from "@/components/disclosure";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageHeaderT } from "@/components/tx";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { JobSearchSummary } from "@/components/applications/job-search-summary";
import { BaselineForm, SnapshotForm } from "@/components/connection-forms";
import { LoadError } from "@/components/load-error";
import { GettingStartedCard } from "@/components/onboarding/checklist";
import { GoalRing } from "@/components/progress-visuals";
import { MeterLegend } from "@/components/meter-legend";
import { ProgressMeter } from "@/components/progress-meter";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadMyProgress } from "@/lib/data/dashboard";
import { countDueFollowUps } from "@/lib/data/follow-ups";
import { disciplineName } from "@/lib/domain";
import { nextAction } from "@/lib/progress/next-action";
import { getSettings } from "@/lib/data/settings";
import { formatters } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

export const metadata = { title: "Overview · Network Growth" };

export default function OverviewPage() {
  return (
    <div className="grid gap-6">
      <PageHeaderT title="pages.overview.title" description="pages.overview.description" />
      <Suspense fallback={<PageSkeleton labelKey="loading.progress" />}>
        <OverviewContent />
      </Suspense>
    </div>
  );
}

async function OverviewContent() {
  let progress;
  let paused = false;
  let followUpsDue = 0;
  try {
    const [p, { row }] = await Promise.all([loadMyProgress(), getSettings()]);
    progress = p;
    paused = row?.paused ?? false;
    followUpsDue = await countDueFollowUps(p.today);
  } catch (e) {
    unstable_rethrow(e); // let Next.js postpone/redirect signals through
    return <LoadError what="your progress" />;
  }

  const { overall, activity, disciplines, today } = progress;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const fmt = formatters(locale);
  const action = nextAction(progress, paused, t);
  const planSet = progress.catalog.disciplines.length > 0 && progress.catalog.universities.length > 0 && overall.target !== null;
  const todayLinks = [
    overall.readyForOutreach > 0 ? { href: "/queue", label: t("overview.readyToSend", { count: overall.readyForOutreach }) } : null,
    overall.awaitingReview > 0 ? { href: "/candidates?status=awaiting_review", label: t("overview.awaitingReview", { count: overall.awaitingReview }) } : null,
    followUpsDue > 0 ? { href: "/follow-ups", label: followUpsDue === 1 ? t("overview.followUpOne") : t("overview.followUpMany", { count: followUpsDue }) } : null,
  ].filter((t): t is { href: string; label: string } => t !== null);
  // An empty dashboard of zeros is noise: keep the breakdown folded until there is something to show.
  const hasActivity = overall.trackedAccepted + overall.pending + overall.awaitingReview + overall.readyForOutreach + activity.discoveredThisWeek + activity.sentThisWeek > 0;

  return (
    <>
      <Card className="border-primary/30" data-tour="primary-action">
        <CardHeader>
          <CardDescription>{t("overview.nextLabel")}</CardDescription>
          <h2 className="font-heading text-lg leading-snug font-medium">{action.title}</h2>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">{action.detail}</p>
          <Link href={action.href} className={buttonVariants({ size: "lg" })}>
            {action.cta} <ArrowRight aria-hidden />
          </Link>
        </CardContent>
      </Card>

      <Suspense fallback={null}>
        <GettingStartedCard hasPlan={planSet} hasBaseline={overall.baseline !== null} />
      </Suspense>

      {todayLinks.length ? (
        <nav aria-label={t("overview.today")} className="flex flex-wrap gap-2" data-tour="today">
          {todayLinks.map((t) => (
            <Link key={t.href} href={t.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <Suspense fallback={null}>
        <JobSearchSummary />
      </Suspense>

      {overall.baseline === null ? (
        <Card id="starting-point">
          <CardHeader>
            <CardTitle>{t("overview.startingPoint")}</CardTitle>
            <CardDescription>{t("overview.startingPointHelp")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BaselineForm today={today} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardDescription>{t("overview.networkTotal")}</CardDescription>
            {overall.current === null ? (
              <CardTitle>{t("overview.noCountYet")}</CardTitle>
            ) : (
              <p className="text-5xl font-semibold">
                {fmt.number(overall.current)}
                <span className="text-lg font-normal text-muted-foreground">
                  {" "}
                  {overall.target === null ? t("overview.noGoal") : ` / ${fmt.number(overall.target)}`}
                </span>
              </p>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            {overall.additionalSinceStart !== null && overall.growthGoal !== null ? (
              <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
                {overall.growthGoal > 0 ? <GoalRing accepted={Math.max(0, overall.additionalSinceStart)} pending={overall.pending} target={overall.growthGoal} label={t("overview.ringLabel")} /> : null}
                <div className="grid gap-1.5">
                <ProgressMeter
                  label={t("overview.meterLabel")}
                  accepted={Math.max(0, overall.additionalSinceStart)}
                  target={overall.growthGoal}
                  valueText={t("meter.valueText", { accepted: Math.max(0, overall.additionalSinceStart), target: overall.growthGoal })}
                />
                <p className="text-sm text-muted-foreground">
                  {t("overview.growthLine", {
                    signed: formatSigned(overall.additionalSinceStart, fmt.number),
                    baseline: fmt.number(overall.baseline),
                    percent: overall.percent ?? 0,
                    goal: fmt.number(overall.growthGoal),
                    remaining: overall.remaining === null || overall.remaining === undefined ? "" : fmt.number(overall.remaining),
                  })}
                </p>
                </div>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t("overview.totalNote", {
                last: overall.snapshotAt ? t("overview.lastOn", { date: fmt.date(overall.snapshotAt, { dateStyle: "short" }) }) : "",
              })}
            </p>
            <Disclosure variant="plain" summary={t("overview.updateCount")} className="font-medium">
              <SnapshotForm today={today} />
            </Disclosure>
          </CardContent>
        </Card>
      )}

      <Disclosure
        variant="plain"
        open={hasActivity}
        data-tour="breakdown"
        className="font-medium"
        summary={
          <>
            {t("overview.breakdown")}
            <span className="font-normal text-muted-foreground">{t("overview.breakdownSub")}</span>
          </>
        }
      >
        <div className="grid gap-6">
      <section aria-labelledby="pipeline" className="grid gap-2">
        <h2 id="pipeline" className="font-medium">
          {t("overview.pipeline")}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile
            label={t("overview.trackedAccepted")}
            value={overall.trackedAccepted}
            hint={overall.fromExport ? t("overview.countTowardExport", { count: overall.fromExport }) : t("overview.countToward")}
          />
          <StatTile label={t("overview.invitationsPending")} value={overall.pending} hint={t("overview.notCountedUntil")} />
          <StatTile label={t("overview.awaitingReviewTile")} value={overall.awaitingReview} />
          <StatTile label={t("overview.readyForOutreach")} value={overall.readyForOutreach} hint={t("overview.approvedNotInvited")} />
          <StatTile
            label={t("overview.discoveredWeek")}
            value={activity.discoveredThisWeek}
            hint={t("overview.discoveredToday", { count: activity.discoveredToday })}
          />
        </div>
        {overall.acceptedNeedsClassification > 0 ? (
          <p className="text-sm">
            <Badge variant="outline">{t("overview.needsClassification")}</Badge>{" "}
            {overall.acceptedNeedsClassification === 1 ? t("overview.classifyOne") : t("overview.classifyMany", { count: overall.acceptedNeedsClassification })}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="activity" className="grid gap-2">
        <h2 id="activity" className="font-medium">
          {t("overview.activity")}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label={t("overview.sentToday")} value={activity.sentToday} />
          <StatTile label={t("overview.sentWeek")} value={activity.sentThisWeek} hint={t("overview.weekStarts")} />
          <StatTile label={t("overview.acceptedToday")} value={activity.acceptedToday} />
          <StatTile label={t("overview.acceptedWeek")} value={activity.acceptedThisWeek} />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("overview.disciplines")}</CardTitle>
          <CardDescription>{t("overview.disciplinesSub")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {disciplines.map((d) => (
            <div key={d.discipline} className="grid gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {d.rank}. {disciplineName(progress.catalog, d.discipline)}{" "}
                  {d.isFocus ? <Badge>{t("overview.focus")}</Badge> : null}
                  {d.complete ? <Badge variant="secondary">{t("overview.complete")}</Badge> : null}
                </span>
                <span className="text-muted-foreground">
                  {d.accepted} / {d.target}
                  {d.pending ? t("overview.pendingCount", { count: d.pending }) : ""}
                </span>
              </div>
              <ProgressMeter
                label={t("overview.progressOf", { name: disciplineName(progress.catalog, d.discipline) })}
                accepted={d.accepted}
                pending={d.pending}
                target={d.target}
                valueText={d.pending ? t("meter.valueTextPending", { accepted: d.accepted, target: d.target, pending: d.pending }) : t("meter.valueText", { accepted: d.accepted, target: d.target })}
              />
            </div>
          ))}
          <MeterLegend />
          <Link href="/disciplines" className="text-sm underline underline-offset-4">
            {t("overview.disciplineDetails")}
          </Link>
        </CardContent>
      </Card>
        </div>
      </Disclosure>
    </>
  );
}

function formatSigned(n: number, format: (n: number) => string) {
  return `${n >= 0 ? "+" : "−"}${format(Math.abs(n))}`;
}
