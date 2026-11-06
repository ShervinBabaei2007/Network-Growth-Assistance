import { Tx } from "@/components/tx";
import { unstable_rethrow } from "next/navigation";
import { Disclosure } from "@/components/disclosure";
import { PageSkeleton } from "@/components/page-skeleton";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { LazyDailyBars, LazyNetworkLine } from "@/components/lazy-chart";
import { ActivityHeatmap, Funnel } from "@/components/progress-visuals";
import { LoadError } from "@/components/load-error";
import { Term } from "@/components/term";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildAnalytics } from "@/lib/analytics";
import { currentUserId, loadExportConnections, loadInvitations } from "@/lib/data/dashboard";
import { getSettings } from "@/lib/data/settings";
import { disciplineName, poolUniversities, targetUniversities, universityName, type CandidateStatus } from "@/lib/domain";
import { computeTodaysPlan } from "@/lib/jobs/daily-queue";
import { createClient } from "@/lib/supabase/server";
import { buildFunnel, buildHeatGrid } from "@/lib/visuals";

export const metadata = { title: "Analytics · Network Growth" };

const DAYS = 30;
const WEEKS = 8;
const PAGE = 1000;

export default function AnalyticsPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold"><Tx k="pages.analytics.title" /></h1>
        <p className="text-sm text-muted-foreground"><Tx k="pages.analytics.description" /></p>
      </div>
      <Suspense fallback={<PageSkeleton labelKey="loading.analytics" />}>
        <AnalyticsContent />
      </Suspense>
    </div>
  );
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) throw error ?? new Error("load");
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

async function load(supabase: Supabase) {
  const userId = await currentUserId(supabase);
  const { row: settings, error: settingsError } = await getSettings();
  if (settingsError || !settings) throw new Error(settingsError ?? "Settings not found");
  const tz = settings.timezone;
  const [invitations, exportConnections, snapshots, todays] = await Promise.all([
    loadInvitations(supabase, userId, tz),
    loadExportConnections(supabase, userId, tz),
    loadAll((a, b) => supabase.from("connection_snapshots").select("recorded_at, total_connections").order("recorded_at").range(a, b)),
    computeTodaysPlan(supabase, userId),
  ]);
  const analytics = buildAnalytics({
    now: new Date(),
    timezone: settings.timezone,
    days: DAYS,
    weeks: WEEKS,
    invitations,
    exportConnections,
    snapshots: snapshots.map((s) => ({ recordedAt: s.recorded_at, total: s.total_connections })),
  });
  const funnel = await loadFunnel(supabase);
  return { analytics, plan: todays.plan, progress: todays.progress, funnel };
}

/**
 * Where people are in the pipeline right now, from each candidate's current status. "Approved" means approved at some
 * point (people since invited are included); someone approved and later marked "not a match" is not.
 */
async function loadFunnel(supabase: Supabase) {
  const count = async (statuses?: CandidateStatus[]) => {
    const base = supabase.from("candidates").select("id", { count: "exact", head: true });
    const { count: n, error } = await (statuses ? base.in("status", statuses) : base);
    if (error) throw error;
    return n ?? 0;
  };
  const invitedStatuses: CandidateStatus[] = ["invitation_sent", "invitation_pending", "connected", "declined_withdrawn"];
  const [discovered, approvedNow, invited, pending, accepted] = await Promise.all([
    count(),
    count(["approved"]),
    count(invitedStatuses),
    count(["invitation_sent", "invitation_pending"]),
    count(["connected"]),
  ]);
  return buildFunnel({ discovered, approved: approvedNow + invited, invited, pending, accepted });
}

async function AnalyticsContent() {
  let data;
  try {
    data = await load(await createClient());
  } catch (e) {
    unstable_rethrow(e); // let Next.js postpone/redirect signals through
    console.error("[analytics] load failed:", e instanceof Error ? e.message : e);
    return <LoadError what="analytics" />;
  }
  const { analytics: a, plan, progress, funnel } = data;
  const heat = buildHeatGrid(a.daily.map((d) => ({ date: d.date, count: d.sent + d.accepted })));
  const acc = a.acceptance;

  return (
    <>
      <section aria-labelledby="acceptance" className="grid gap-2">
        <h2 id="acceptance" className="font-medium">
          Acceptance
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile
            label="Acceptance rate"
            value={acc.rate === null ? "Not enough data" : `${Math.round(acc.rate * 100)}%`}
            hint={acc.rate === null ? `Shown once ${acc.minResolved} invitations have an outcome (${acc.resolved} so far)` : `${acc.accepted} of ${acc.resolved} with a known outcome`}
          />
          <StatTile label={<Term term="pending" />} value={acc.pending} hint="Not in the rate until they resolve" />
          <StatTile label="Declined or withdrawn" value={acc.declined + acc.withdrawn} />
          <StatTile label="Ready for outreach" value={progress.overall.readyForOutreach} hint="Approved, not yet invited" />
          <StatTile label={`Sent, last ${DAYS} days`} value={a.daily.reduce((n, d) => n + d.sent, 0)} hint="Invitations you recorded" trend={a.daily.map((d) => d.sent)} />
          <StatTile label={`Accepted, last ${DAYS} days`} value={a.daily.reduce((n, d) => n + d.accepted, 0)} hint="Connections that said yes" trend={a.daily.map((d) => d.accepted)} />
        </div>
        <p className="text-xs text-muted-foreground">
          The rate is accepted ÷ (accepted + declined + withdrawn). <Term term="pending">Pending</Term> invitations are left out
          because their outcome isn&apos;t known yet; counting them as “not accepted” would understate it,
          especially right after a busy week. LinkedIn rarely tells you about declines, so the rate
          may read a little high.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title={`Invitations sent · last ${DAYS} days`} empty={!a.hasActivity} table={<DailyTable rows={a.daily} />}>
          <LazyDailyBars data={a.daily} dataKey="sent" unit="sent" label={`Invitations sent per day over the last ${DAYS} days`} />
        </ChartCard>
        <ChartCard title={`Connections accepted · last ${DAYS} days`} empty={!a.hasActivity} table={<DailyTable rows={a.daily} />}>
          <LazyDailyBars data={a.daily} dataKey="accepted" unit="accepted" label={`Connections accepted per day over the last ${DAYS} days`} />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Outreach funnel"
          description="Where the people you found are now. Waiting invitations are hatched and never counted as accepted."
          empty={!funnel}
          emptyText="Nobody has been added yet. The funnel appears once you have candidates."
          table={funnel ? <FunnelTable steps={funnel} /> : null}
        >
          {funnel ? <Funnel steps={funnel} /> : null}
        </ChartCard>
        <ChartCard
          title={`Activity · last ${DAYS} days`}
          description="Invitations sent plus connections accepted, per day."
          empty={!heat}
          table={<DailyTable rows={a.daily} />}
        >
          {heat ? <ActivityHeatmap grid={heat} label={`Activity per day over the last ${DAYS} days: ${heat.total} in total, busiest day ${heat.max}. A table follows.`} /> : null}
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weekly activity</CardTitle>
          <CardDescription>Weeks start on Monday. Acceptances are counted in the week they happened.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week of</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Accepted</TableHead>
                <TableHead className="text-right">Declined / withdrawn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              {[...a.weekly].reverse().map((w) => (
                <TableRow key={w.weekOf}>
                  <TableCell>{w.weekOf}</TableCell>
                  <TableCell className="text-right">{w.sent}</TableCell>
                  <TableCell className="text-right">{w.accepted}</TableCell>
                  <TableCell className="text-right">{w.declinedOrWithdrawn}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ChartCard
        title="Network total over time"
        description="From the counts you record on the Overview and from LinkedIn exports."
        empty={a.networkHistory.length < 2}
        emptyText={a.networkHistory.length === 1 ? "Only one count recorded so far. Record another to see a trend." : "No connection counts recorded yet."}
        table={
          <ul className="grid gap-1 text-sm tabular-nums">
            {a.networkHistory.map((p) => (
              <li key={p.date}>
                {p.date}: {p.total.toLocaleString("en-CA")}
              </li>
            ))}
          </ul>
        }
      >
        <LazyNetworkLine data={a.networkHistory} label="Recorded network total by date" />
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle>Progress by discipline and university</CardTitle>
          <CardDescription>
            Accepted connections toward each target. Full detail on the{" "}
            <Link href="/disciplines" className="underline underline-offset-4">
              Disciplines
            </Link>{" "}
            and{" "}
            <Link href="/universities" className="underline underline-offset-4">
              Universities
            </Link>{" "}
            pages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Discipline</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {targetUniversities(progress.catalog).map((u) => (
                  <TableHead key={u.id} className="text-right">
                    {u.name}
                  </TableHead>
                ))}
                {poolUniversities(progress.catalog).length ? <TableHead className="text-right">{poolUniversities(progress.catalog).map((u) => u.name).join(" + ")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              {progress.disciplines.map((d) => (
                <TableRow key={d.discipline}>
                  <TableCell>{disciplineName(progress.catalog, d.discipline)}</TableCell>
                  <TableCell className="text-right">
                    {d.accepted} / {d.target || "—"}
                  </TableCell>
                  {d.primaryCells.map((c) => (
                    <TableCell key={c.university} className="text-right">
                      {c.accepted} / {c.target ?? "—"}
                    </TableCell>
                  ))}
                  {poolUniversities(progress.catalog).length ? <TableCell className="text-right">{d.acceptedAdditional}</TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories with too few candidates</CardTitle>
          <CardDescription>Approved candidates waiting compared with the invitations still needed.</CardDescription>
        </CardHeader>
        <CardContent>
          {plan.shortfalls.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every active category has enough approved candidates.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {plan.shortfalls
                .filter((s) => s.university !== null)
                .map((s) => (
                  <li key={`${s.discipline}-${s.university}`}>
                    {disciplineName(progress.catalog, s.discipline)} · {universityName(progress.catalog, s.university)}: {s.available} ready, about {s.invitesWanted} needed
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function ChartCard({
  title,
  description,
  empty,
  emptyText = "No activity recorded in this period yet.",
  table,
  children,
}: {
  title: string;
  description?: string;
  empty: boolean;
  emptyText?: string;
  table: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-2">
        {empty ? (
          <p className="rounded-md bg-muted px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <>
            {children}
            <Disclosure variant="plain" summary="Show as table">
              {table}
            </Disclosure>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelTable({ steps }: { steps: NonNullable<Awaited<ReturnType<typeof loadFunnel>>> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Step</TableHead>
          <TableHead className="text-right">People</TableHead>
          <TableHead className="text-right">Waiting for an answer</TableHead>
          <TableHead className="text-right">Didn&apos;t continue</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {steps.map((s) => (
          <TableRow key={s.key}>
            <TableCell>{s.label}</TableCell>
            <TableCell className="text-right">{s.value}</TableCell>
            <TableCell className="text-right">{s.pending || "—"}</TableCell>
            <TableCell className="text-right">{s.dropOffPercent === null ? "—" : `${s.dropOffPercent}%`}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DailyTable({ rows }: { rows: { date: string; sent: number; accepted: number }[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Sent</TableHead>
          <TableHead className="text-right">Accepted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {rows
          .filter((r) => r.sent || r.accepted)
          .map((r) => (
            <TableRow key={r.date}>
              <TableCell>{r.date}</TableCell>
              <TableCell className="text-right">{r.sent}</TableCell>
              <TableCell className="text-right">{r.accepted}</TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
