import { Suspense } from "react";
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
import { DISCIPLINE_LABELS, PRIMARY_UNIVERSITIES, UNIVERSITY_LABELS } from "@/lib/domain";
import { ADDITIONAL_UNIVERSITIES } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Universities · Network Growth" };

const SHORT: Record<string, string> = { uoft: "U of T", ubc: "UBC", sfu: "SFU", waterloo: "Waterloo" };

export default function UniversitiesPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold">Universities</h1>
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
  } catch {
    return <LoadError what="university progress" />;
  }
  const { disciplines } = progress;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Primary targets</CardTitle>
          <CardDescription>
            Accepted connections toward each U of T and UBC target, per discipline.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            {PRIMARY_UNIVERSITIES.map((u) => (
              <section key={u} aria-label={UNIVERSITY_LABELS[u]} className="grid gap-3">
                <h2 className="font-medium">{UNIVERSITY_LABELS[u]}</h2>
                {disciplines.map((d) => {
                  const c = d.primaryCells.find((cell) => cell.university === u)!;
                  return (
                    <div key={d.discipline} className="grid gap-1">
                      <div className="flex justify-between gap-2 text-sm">
                        <span>{DISCIPLINE_LABELS[d.discipline]}</span>
                        <span className="text-muted-foreground">
                          {c.target === null ? "No target" : `${c.accepted} / ${c.target}`}
                        </span>
                      </div>
                      {c.target !== null ? (
                        <ProgressMeter
                          label={`${SHORT[u]} ${DISCIPLINE_LABELS[d.discipline]}`}
                          accepted={c.accepted}
                          pending={c.pending}
                          target={c.target}
                        />
                      ) : null}
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
                <TableHead>University</TableHead>
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
                    <TableCell>{DISCIPLINE_LABELS[d.discipline]}</TableCell>
                    <TableCell>{SHORT[c.university]}</TableCell>
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

      <Card>
        <CardHeader>
          <CardTitle>Additional pools: SFU and Waterloo</CardTitle>
          <CardDescription>
            These help fill gaps when U of T or UBC candidates run short. Connections here count
            toward the discipline total but are a deviation from the preferred U of T/UBC split,
            and they never raise the overall target.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Discipline</TableHead>
                {ADDITIONAL_UNIVERSITIES.map((u) => (
                  <TableHead key={u} colSpan={2} className="text-center">
                    {SHORT[u]}
                  </TableHead>
                ))}
              </TableRow>
              <TableRow>
                <TableHead />
                {ADDITIONAL_UNIVERSITIES.map((u) => (
                  <FragmentHeads key={u} />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              {disciplines.map((d) => (
                <TableRow key={d.discipline}>
                  <TableCell>{DISCIPLINE_LABELS[d.discipline]}</TableCell>
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
            “Identified” counts candidates with a confirmed school and program, excluding those
            marked not a match or do not contact.
          </p>
        </CardContent>
      </Card>
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
