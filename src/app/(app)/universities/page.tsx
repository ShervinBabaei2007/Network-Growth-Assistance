import { Tx } from "@/components/tx";
import { getT } from "@/lib/i18n/server";
import { unstable_rethrow } from "next/navigation";
import { PageSkeleton } from "@/components/page-skeleton";
import { Suspense } from "react";
import Link from "next/link";
import { LoadError } from "@/components/load-error";
import { MeterLegend } from "@/components/meter-legend";
import { ProgressMeter } from "@/components/progress-meter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadMyProgress } from "@/lib/data/dashboard";
import { disciplineName, poolUniversities, targetUniversities, universityName } from "@/lib/domain";

export const metadata = { title: "Schools · Network Growth" };

export default function UniversitiesPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold"><Tx k="pages.universities.title" /></h1>
      <Suspense fallback={<PageSkeleton labelKey="loading.generic" />}>
        <UniversityProgress />
      </Suspense>
    </div>
  );
}

async function UniversityProgress() {
  let progress;
  try {
    progress = await loadMyProgress();
  } catch (e) {
    unstable_rethrow(e); // let Next.js postpone/redirect signals through
    return <LoadError what="school progress" />;
  }
  const { disciplines, catalog } = progress;
  const t = await getT();
  const withTargets = targetUniversities(catalog);
  const pools = poolUniversities(catalog);

  if (!catalog.universities.length || !catalog.disciplines.length) {
    return (
      <p className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">
        {t("schoolsPage.emptyBefore")}
        <Link href="/settings#plan" className="underline underline-offset-4">
          {t("schoolsPage.emptyLink")}
        </Link>
        {t("schoolsPage.emptyAfter")}
      </p>
    );
  }

  return (
    <>
      {withTargets.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("schoolsPage.ownTargetsTitle")}</CardTitle>
            <CardDescription>{t("schoolsPage.ownTargetsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              {withTargets.map((u) => (
                <section key={u.id} aria-label={u.name} className="grid gap-3">
                  <h2 className="font-medium">{u.name}</h2>
                  {disciplines.map((d) => {
                    const c = d.primaryCells.find((cell) => cell.university === u.id)!;
                    const name = disciplineName(catalog, d.discipline);
                    return (
                      <div key={d.discipline} className="grid gap-1">
                        <div className="flex justify-between gap-2 text-sm">
                          <span>{name}</span>
                          <span className="text-muted-foreground">{c.target === null ? t("schoolsPage.noTarget") : `${c.accepted} / ${c.target}`}</span>
                        </div>
                        {c.target !== null ? <ProgressMeter label={`${u.name} ${name}`} accepted={c.accepted} pending={c.pending} target={c.target} /> : null}
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
            <MeterLegend />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("schoolsPage.discipline")}</TableHead>
                  <TableHead>{t("schoolsPage.school")}</TableHead>
                  <TableHead className="text-right">{t("schoolsPage.accepted")}</TableHead>
                  <TableHead className="text-right">{t("schoolsPage.target")}</TableHead>
                  <TableHead className="text-right">{t("schoolsPage.remaining")}</TableHead>
                  <TableHead className="text-right">{t("schoolsPage.pending")}</TableHead>
                  <TableHead className="text-right">{t("schoolsPage.ready")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="tabular-nums">
                {disciplines.flatMap((d) =>
                  d.primaryCells.map((c) => (
                    <TableRow key={`${d.discipline}-${c.university}`}>
                      <TableCell>{disciplineName(catalog, d.discipline)}</TableCell>
                      <TableCell>{universityName(catalog, c.university)}</TableCell>
                      <TableCell className="text-right">{c.accepted}</TableCell>
                      <TableCell className="text-right">{c.target ?? "—"}</TableCell>
                      <TableCell className="text-right">{c.remaining ?? "—"}</TableCell>
                      <TableCell className="text-right">{c.pending}</TableCell>
                      <TableCell className="text-right">{c.available}</TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {pools.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("schoolsPage.poolsTitle")}</CardTitle>
            <CardDescription>{t("schoolsPage.poolsDesc", { schools: pools.map((u) => u.name).join(", ") })}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("schoolsPage.discipline")}</TableHead>
                  {pools.map((u) => (
                    <TableHead key={u.id} colSpan={2} className="text-center">
                      {u.name}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  <TableHead />
                  {pools.map((u) => (
                    <FragmentHeads key={u.id} identified={t("schoolsPage.identified")} accepted={t("schoolsPage.accepted")} />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="tabular-nums">
                {disciplines.map((d) => (
                  <TableRow key={d.discipline}>
                    <TableCell>{disciplineName(catalog, d.discipline)}</TableCell>
                    {d.additionalCells.flatMap((c) => [
                      <TableCell key={`${c.university}-i`} className="text-right">
                        {c.identified}
                      </TableCell>,
                      <TableCell key={`${c.university}-a`} className="text-right">
                        {c.accepted}
                      </TableCell>,
                    ])}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("schoolsPage.identifiedNote")}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function FragmentHeads({ identified, accepted }: { identified: string; accepted: string }) {
  return (
    <>
      <TableHead className="text-right">{identified}</TableHead>
      <TableHead className="text-right">{accepted}</TableHead>
    </>
  );
}
