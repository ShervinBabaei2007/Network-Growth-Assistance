import { Tx } from "@/components/tx";
import { formatters } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { unstable_rethrow } from "next/navigation";
import { PageSkeleton } from "@/components/page-skeleton";
import { Suspense } from "react";
import { LoadError } from "@/components/load-error";
import { MeterLegend } from "@/components/meter-legend";
import { ProgressMeter } from "@/components/progress-meter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadMyProgress } from "@/lib/data/dashboard";
import { disciplineName, poolUniversities, targetUniversities } from "@/lib/domain";

export const metadata = { title: "Disciplines · Network Growth" };

export default function DisciplinesPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold"><Tx k="pages.disciplines.title" /></h1>
        <p className="text-sm text-muted-foreground">
          <Tx k="pages.disciplines.description" />
        </p>
      </div>
      <Suspense fallback={<PageSkeleton labelKey="loading.generic" />}>
        <DisciplineCards />
      </Suspense>
    </div>
  );
}

async function DisciplineCards() {
  let progress;
  try {
    progress = await loadMyProgress();
  } catch (e) {
    unstable_rethrow(e); // let Next.js postpone/redirect signals through
    return <LoadError what="discipline progress" />;
  }
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const fmt = formatters(locale);

  return (
    <>
      <MeterLegend />
      <div className="grid gap-4 lg:grid-cols-2">
        {progress.disciplines.map((d) => {
          const name = disciplineName(progress.catalog, d.discipline);
          const shortOfCandidates = !d.complete && d.available < d.remaining;
          return (
            <Card key={d.discipline} className={d.isFocus ? "border-primary/40" : undefined}>
              <CardHeader>
                <CardDescription>{t("disciplinesPage.priority", { rank: d.rank })}</CardDescription>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {name}
                  {d.isFocus ? <Badge>{t("disciplinesPage.focus")}</Badge> : null}
                  {d.complete ? <Badge variant="secondary">{t("disciplinesPage.targetMet")}</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-1.5">
                  <ProgressMeter label={t("disciplinesPage.progressOf", { name })} accepted={d.accepted} pending={d.pending} target={d.target} valueText={d.pending ? t("meter.valueTextPending", { accepted: d.accepted, target: d.target, pending: d.pending }) : t("meter.valueText", { accepted: d.accepted, target: d.target })} />
                  <p className="text-sm text-muted-foreground">
                    {t("disciplinesPage.acceptedOf", { accepted: d.accepted, target: d.target, percent: d.percent })}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  <Fact label={t("disciplinesPage.remaining")} value={fmt.number(d.remaining)} />
                  <Fact label={t("disciplinesPage.pending")} value={fmt.number(d.pending)} />
                  <Fact label={t("disciplinesPage.ready")} value={fmt.number(d.available)} />
                  <Fact label={t("disciplinesPage.fromSchools", { schools: targetUniversities(progress.catalog).map((u) => u.name).join(" + ") || t("disciplinesPage.fromSchoolsFallback") })} value={fmt.number(d.acceptedPrimary)} />
                  {poolUniversities(progress.catalog).length ? <Fact label={t("disciplinesPage.fromSchools", { schools: poolUniversities(progress.catalog).map((u) => u.name).join(" + ") })} value={fmt.number(d.acceptedAdditional)} /> : null}
                </dl>
                {shortOfCandidates ? (
                  <p className="text-sm">
                    <Badge variant="outline">{t("disciplinesPage.lowPool")}</Badge>{" "}
                    {d.available === 1 ? t("disciplinesPage.lowPoolOne", { remaining: d.remaining }) : t("disciplinesPage.lowPoolMany", { available: d.available, remaining: d.remaining })}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
