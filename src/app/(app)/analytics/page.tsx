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
import { formatters } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

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
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const fmt = formatters(locale);

  return (
    <>
      <section aria-labelledby="acceptance" className="grid gap-2">
        <h2 id="acceptance" className="font-medium">
          {t("analytics.acceptance")}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile
            label={t("analytics.rate")}
            value={acc.rate === null ? t("analytics.notEnough") : `${Math.round(acc.rate * 100)} %`}
            hint={acc.rate === null ? t("analytics.shownOnce", { min: acc.minResolved, resolved: acc.resolved }) : t("analytics.ofKnown", { accepted: acc.accepted, resolved: acc.resolved })}
          />
          <StatTile label={<Term term="pending" />} value={acc.pending} hint={t("analytics.pendingHint")} />
          <StatTile label={t("analytics.declined")} value={acc.declined + acc.withdrawn} />
          <StatTile label={t("analytics.ready")} value={progress.overall.readyForOutreach} hint={t("analytics.approvedNotInvited")} />
          <StatTile label={t("analytics.sentLast", { days: DAYS })} value={a.daily.reduce((n, d) => n + d.sent, 0)} hint={t("analytics.recorded")} trend={a.daily.map((d) => d.sent)} />
          <StatTile label={t("analytics.acceptedLast", { days: DAYS })} value={a.daily.reduce((n, d) => n + d.accepted, 0)} hint={t("analytics.saidYes")} trend={a.daily.map((d) => d.accepted)} />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("analytics.rateNoteBefore")}<Term term="pending">{t("analytics.termPending")}</Term>{t("analytics.rateNoteAfter")}
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title={t("analytics.sentTitle", { days: DAYS })} empty={!a.hasActivity} table={<DailyTable rows={a.daily} />}>
          <LazyDailyBars data={a.daily} dataKey="sent" unit={t("analytics.unitSent")} label={t("analytics.sentLabel", { days: DAYS })} />
        </ChartCard>
        <ChartCard title={t("analytics.acceptedTitle", { days: DAYS })} empty={!a.hasActivity} table={<DailyTable rows={a.daily} />}>
          <LazyDailyBars data={a.daily} dataKey="accepted" unit={t("analytics.unitAccepted")} label={t("analytics.acceptedLabel", { days: DAYS })} />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={t("analytics.funnelTitle")}
          description={t("analytics.funnelDesc")}
          empty={!funnel}
          emptyText={t("analytics.funnelEmpty")}
          table={funnel ? <FunnelTable steps={funnel} /> : null}
        >
          {funnel ? <Funnel steps={funnel} /> : null}
        </ChartCard>
        <ChartCard
          title={t("analytics.activityTitle", { days: DAYS })}
          description={t("analytics.activityDesc")}
          empty={!heat}
          table={<DailyTable rows={a.daily} />}
        >
          {heat ? <ActivityHeatmap grid={heat} label={t("analytics.heatLabel", { days: DAYS, total: heat.total, max: heat.max })} /> : null}
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("analytics.weeklyTitle")}</CardTitle>
          <CardDescription>{t("analytics.weeklyDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("analytics.weekOf")}</TableHead>
                <TableHead className="text-right">{t("analytics.sentCol")}</TableHead>
                <TableHead className="text-right">{t("analytics.acceptedCol")}</TableHead>
                <TableHead className="text-right">{t("analytics.declinedWithdrawn")}</TableHead>
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
        title={t("analytics.networkTitle")}
        description={t("analytics.networkDesc")}
        empty={a.networkHistory.length < 2}
        emptyText={a.networkHistory.length === 1 ? t("analytics.onlyOne") : t("analytics.noCounts")}
        table={
          <ul className="grid gap-1 text-sm tabular-nums">
            {a.networkHistory.map((p) => (
              <li key={p.date}>
                {p.date}: {fmt.number(p.total)}
              </li>
            ))}
          </ul>
        }
      >
        <LazyNetworkLine data={a.networkHistory} label={t("analytics.networkLabel")} />
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle>{t("analytics.progressTitle")}</CardTitle>
          <CardDescription>
            {t("analytics.progressDescA")}
            <Link href="/disciplines" className="underline underline-offset-4">
              {t("pages.disciplines.title")}
            </Link>
            {t("analytics.progressAnd")}
            <Link href="/universities" className="underline underline-offset-4">
              {t("analytics.universitiesLink")}
            </Link>
            {t("analytics.progressDescB")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("analytics.disciplineCol")}</TableHead>
                <TableHead className="text-right">{t("analytics.totalCol")}</TableHead>
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
          <CardTitle>{t("analytics.shortTitle")}</CardTitle>
          <CardDescription>{t("analytics.shortDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {plan.shortfalls.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("analytics.shortNone")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {plan.shortfalls
                .filter((s) => s.university !== null)
                .map((s) => (
                  <li key={`${s.discipline}-${s.university}`}>
                    {t("analytics.shortLine", { discipline: disciplineName(progress.catalog, s.discipline), university: universityName(progress.catalog, s.university), available: s.available, wanted: s.invitesWanted })}
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

async function ChartCard({
  title,
  description,
  empty,
  emptyText,
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
  const t = await getT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-2">
        {empty ? (
          <p className="rounded-md bg-muted px-3 py-6 text-center text-sm text-muted-foreground">{emptyText ?? t("analytics.noActivity")}</p>
        ) : (
          <>
            {children}
            <Disclosure variant="plain" summary={t("analytics.showTable")}>
              {table}
            </Disclosure>
          </>
        )}
      </CardContent>
    </Card>
  );
}

async function FunnelTable({ steps }: { steps: NonNullable<Awaited<ReturnType<typeof loadFunnel>>> }) {
  const t = await getT();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("analytics.stepCol")}</TableHead>
          <TableHead className="text-right">{t("analytics.peopleCol")}</TableHead>
          <TableHead className="text-right">{t("analytics.waitingCol")}</TableHead>
          <TableHead className="text-right">{t("analytics.dropCol")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {steps.map((s) => (
          <TableRow key={s.key}>
            <TableCell>{t(`funnel.${s.key}`)}</TableCell>
            <TableCell className="text-right">{s.value}</TableCell>
            <TableCell className="text-right">{s.pending || "—"}</TableCell>
            <TableCell className="text-right">{s.dropOffPercent === null ? "—" : `${s.dropOffPercent} %`}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

async function DailyTable({ rows }: { rows: { date: string; sent: number; accepted: number }[] }) {
  const t = await getT();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("analytics.dateCol")}</TableHead>
          <TableHead className="text-right">{t("analytics.sentCol")}</TableHead>
          <TableHead className="text-right">{t("analytics.acceptedCol")}</TableHead>
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
