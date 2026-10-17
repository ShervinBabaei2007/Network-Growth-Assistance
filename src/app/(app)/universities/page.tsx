import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { LoadError } from "@/components/load-error";
import { MeterLegend, ProgressMeter } from "@/components/progress-meter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currentUserId, loadProgress } from "@/lib/data/dashboard";
import { disciplineName, poolUniversities, targetUniversities, universityName } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Schools · Network Growth" };

export default function UniversitiesPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold">Schools</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <UniversityProgress />
      </Suspense>
    </div>
  );
}

async function UniversityProgress() {
  let progress;
  try {
    const supabase = await createClient();
    progress = await loadProgress(supabase, await currentUserId(supabase));
  } catch (e) {
    unstable_rethrow(e); // let Next.js postpone/redirect signals through
    return <LoadError what="school progress" />;
  }
  const { disciplines, catalog } = progress;
  const withTargets = targetUniversities(catalog);
  const pools = poolUniversities(catalog);

  if (!catalog.universities.length || !catalog.disciplines.length) {
    return (
      <p className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">
        Add the schools and disciplines you want to connect with in{" "}
        <Link href="/settings#plan" className="underline underline-offset-4">
          Settings → Your networking plan
        </Link>
        . Progress for each school appears here.
      </p>
    );
  }

  return (
    <>
      {withTargets.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Schools with their own targets</CardTitle>
            <CardDescription>Accepted connections toward each school&apos;s target, per discipline.</CardDescription>
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
                          <span className="text-muted-foreground">{c.target === null ? "No target" : `${c.accepted} / ${c.target}`}</span>
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
                  <TableHead>Discipline</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Ready</TableHead>
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
            <CardTitle>Extra candidate pools</CardTitle>
            <CardDescription>
              Schools without their own targets ({pools.map((u) => u.name).join(", ")}). They help fill gaps when the schools with targets run short, and count
              toward each discipline&apos;s total.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Discipline</TableHead>
                  {pools.map((u) => (
                    <TableHead key={u.id} colSpan={2} className="text-center">
                      {u.name}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  <TableHead />
                  {pools.map((u) => (
                    <FragmentHeads key={u.id} />
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
              “Identified” counts candidates with a confirmed school and discipline, excluding those marked not a match or do not contact.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function FragmentHeads() {
  return (
    <>
      <TableHead className="text-right">Identified</TableHead>
      <TableHead className="text-right">Accepted</TableHead>
    </>
  );
}
