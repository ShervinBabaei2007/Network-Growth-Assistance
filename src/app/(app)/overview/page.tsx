import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BaselineForm, SnapshotForm } from "@/components/connection-forms";
import { LoadError } from "@/components/load-error";
import { MeterLegend, ProgressMeter } from "@/components/progress-meter";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentUserId, loadProgress } from "@/lib/data/dashboard";
import { DISCIPLINE_LABELS } from "@/lib/domain";
import { nextAction } from "@/lib/progress/next-action";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Overview · Network Growth" };

export default function OverviewPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold">Overview</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading your progress…</p>}>
        <OverviewContent />
      </Suspense>
    </div>
  );
}

async function OverviewContent() {
  const supabase = await createClient();
  let progress;
  let paused = false;
  try {
    const [p, { data: settings }] = await Promise.all([
      loadProgress(supabase, await currentUserId(supabase)),
      supabase.from("settings").select("paused").single(),
    ]);
    progress = p;
    paused = settings?.paused ?? false;
  } catch (e) {
    unstable_rethrow(e); // let Next.js postpone/redirect signals through
    return <LoadError what="your progress" />;
  }

  const { overall, activity, disciplines, today } = progress;
  const action = nextAction(progress, paused);

  return (
    <>
      <Card className="border-primary/30">
        <CardHeader>
          <CardDescription>Next recommended action</CardDescription>
          <CardTitle className="text-lg">{action.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{action.detail}</p>
          {action.kind !== "set-baseline" ? (
            <Link href={action.href} className={buttonVariants({ size: "sm" })}>
              Go <ArrowRight aria-hidden />
            </Link>
          ) : null}
        </CardContent>
      </Card>

      {overall.baseline === null ? (
        <Card id="starting-point">
          <CardHeader>
            <CardTitle>Starting point</CardTitle>
            <CardDescription>
              Enter your connection count when this project began. Only real numbers you enter
              are shown here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BaselineForm today={today} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardDescription>Network total</CardDescription>
            {overall.current === null ? (
              <CardTitle>No connection count recorded yet</CardTitle>
            ) : (
              <p className="text-5xl font-semibold">
                {overall.current.toLocaleString("en-CA")}
                <span className="text-lg font-normal text-muted-foreground">
                  {" "}
                  / {overall.target.toLocaleString("en-CA")}
                </span>
              </p>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            {overall.additionalSinceStart !== null && overall.growthGoal !== null ? (
              <div className="grid gap-1.5">
                <ProgressMeter
                  label="Growth toward the overall target"
                  accepted={Math.max(0, overall.additionalSinceStart)}
                  target={overall.growthGoal}
                />
                <p className="text-sm text-muted-foreground">
                  {formatSigned(overall.additionalSinceStart)} since you started at{" "}
                  {overall.baseline.toLocaleString("en-CA")} · {overall.percent}% of the{" "}
                  {overall.growthGoal.toLocaleString("en-CA")} new connections needed ·{" "}
                  {overall.remaining?.toLocaleString("en-CA")} to go
                </p>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              The network total comes from counts you record
              {overall.snapshotAt
                ? ` (last on ${new Date(overall.snapshotAt).toLocaleDateString("en-CA")})`
                : ""}
              . It can differ from tracked acceptances because it also includes people who invited
              you, connections you didn&apos;t log here, and removals.
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Update connection count</summary>
              <div className="pt-3">
                <SnapshotForm today={today} />
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="pipeline" className="grid gap-2">
        <h2 id="pipeline" className="font-medium">
          Pipeline
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile
            label="Tracked accepted"
            value={overall.trackedAccepted}
            hint={overall.fromExport ? `Count toward targets · ${overall.fromExport} via LinkedIn export` : "Count toward targets"}
          />
          <StatTile label="Invitations pending" value={overall.pending} hint="Not counted until accepted" />
          <StatTile label="Awaiting review" value={overall.awaitingReview} />
          <StatTile label="Ready for outreach" value={overall.readyForOutreach} hint="Approved, not invited" />
          <StatTile
            label="Discovered this week"
            value={activity.discoveredThisWeek}
            hint={`${activity.discoveredToday} today`}
          />
        </div>
        {overall.acceptedNeedsClassification > 0 ? (
          <p className="text-sm">
            <Badge variant="outline">Needs classification</Badge>{" "}
            {overall.acceptedNeedsClassification} accepted connection
            {overall.acceptedNeedsClassification === 1 ? " isn't" : "s aren't"} counted until the
            school and program are confirmed.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="activity" className="grid gap-2">
        <h2 id="activity" className="font-medium">
          Activity
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Invitations sent today" value={activity.sentToday} />
          <StatTile label="Invitations sent this week" value={activity.sentThisWeek} hint="Week starts Monday" />
          <StatTile label="Accepted today" value={activity.acceptedToday} />
          <StatTile label="Accepted this week" value={activity.acceptedThisWeek} />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Disciplines</CardTitle>
          <CardDescription>New accepted connections, in priority order.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {disciplines.map((d) => (
            <div key={d.discipline} className="grid gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {d.rank}. {DISCIPLINE_LABELS[d.discipline]}{" "}
                  {d.isFocus ? <Badge>Focus</Badge> : null}
                  {d.complete ? <Badge variant="secondary">Complete</Badge> : null}
                </span>
                <span className="text-muted-foreground">
                  {d.accepted} / {d.target}
                  {d.pending ? ` · ${d.pending} pending` : ""}
                </span>
              </div>
              <ProgressMeter
                label={`${DISCIPLINE_LABELS[d.discipline]} progress`}
                accepted={d.accepted}
                pending={d.pending}
                target={d.target}
              />
            </div>
          ))}
          <MeterLegend />
          <Link href="/disciplines" className="text-sm underline underline-offset-4">
            Discipline details
          </Link>
        </CardContent>
      </Card>
    </>
  );
}

function formatSigned(n: number) {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("en-CA")}`;
}
